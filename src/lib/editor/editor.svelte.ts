// Editor state: the comic document, selection, mode and history. The document lives in a
// Y.Doc; `comic` is a live projection of it that components read. Every change goes through
// change(): edit a draft copy, and the difference is written to the Y.Doc as one undo step.
// Any transaction on the doc (ours, undo, or a collaborator's) re-syncs `comic` in place.

import type { Editor as TipTap } from '@tiptap/core';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import type { Peer, Presence } from '$lib/collab/presence.svelte';
import { YHistory } from '$lib/history/yhistory.svelte';
import {
	bandSource,
	clearPageBandSlot,
	comicBands,
	hasBand,
	resetPageBands,
	resolveBands,
	setPageBands,
	useOnEveryPage,
	type Band
} from '$lib/model/bands';
import { anchorBalloon, connectBalloons, removeBalloon, repinAnchors } from '$lib/model/balloons';
import { createComic, createPage } from '$lib/model/factory';
import { panelNear } from '$lib/geometry/panel';
import { createBalloon } from '$lib/model/balloons';
import { clone } from '$lib/model/clone';
import { createFreePanel, mergePanels, setGrid, splash, splitPanel } from '$lib/model/panels';
import { REASONS } from '$lib/model/reasons';
import { reconcile } from '$lib/model/reconcile';
import { applyComic, comicToYDoc, LOCAL, projectComic } from '$lib/model/ydoc';
import { fitImage, panImage, zoomImage } from '$lib/geometry/image';
import { panelBox } from '$lib/geometry/panel';
import { addImage } from '$lib/persistence/assets.svelte';
import type {
	Balloon,
	BalloonType,
	BalloonAnchor,
	Bands,
	Comic,
	Corner,
	FreePanel,
	GridSpec,
	Page,
	Panel,
	Rect
} from '$lib/model/types';

export type Selection =
	| { kind: 'none' }
	| { kind: 'panels'; ids: string[] }
	| { kind: 'balloon'; id: string }
	| { kind: 'band'; band: Band };

export type Mode = 'select' | 'image' | 'text';

/** Title edits are not undo steps (they never were). */
const TITLE = 'title';

export class Editor {
	/** The source of truth. Not reactive itself: `comic` mirrors it. */
	doc: Y.Doc = comicToYDoc(createComic());
	comic = $state<Comic>(projectComic(this.doc));
	pageIndex = $state(0);
	selection = $state<Selection>({ kind: 'none' });
	mode = $state<Mode>('select');
	/** null = fit the page to the viewport. */
	zoom = $state<number | null>(null);
	/** Bumped on every document change; autosave watches it. */
	version = $state(0);
	status = $state<string | null>(null);
	/** The balloon whose text is being edited while mode === 'text'. */
	editingBalloonId = $state<string | null>(null);
	/** Whether text mode should start with everything selected (fresh balloons). */
	selectAllOnEdit = $state(false);
	/** The live TipTap instance while editing; textTick bumps on every transaction. */
	textEditor = $state.raw<TipTap | null>(null);
	textTick = $state(0);
	/** The panel whose image is being panned/zoomed while mode === 'image'. */
	imagePanelId = $state<string | null>(null);
	readonly history = new YHistory();
	/** Who else is here (cloud comics); drives the soft hold. */
	presence = $state.raw<Presence | null>(null);

	constructor() {
		this.attach(this.doc);
	}

	get page(): Page {
		return this.comic.pages[this.pageIndex];
	}

	get selectedPanels(): Panel[] {
		const sel = this.selection;
		if (sel.kind !== 'panels') return [];
		return sel.ids.map((id) => this.page.panels.find((p) => p.id === id)).filter((p) => !!p);
	}

	// --- the document ---------------------------------------------------------------------

	private detach: (() => void) | null = null;

	/** Edit `doc` from now on (e.g. one loaded from storage); history starts fresh. */
	attach(doc: Y.Doc): void {
		this.detach?.();
		this.doc = doc;
		this.history.attach(doc.getMap('comic'), { local: LOCAL, other: [ySyncPluginKey] });
		const onUpdate = () => this.sync();
		doc.on('update', onUpdate);
		this.detach = () => doc.off('update', onUpdate);
		this.sync();
	}

	/** Bring `comic` in line with the doc, then keep the page and selection valid. */
	private sync(): void {
		reconcile(this.comic, projectComic(this.doc));
		this.pageIndex = Math.max(0, Math.min(this.pageIndex, this.comic.pages.length - 1));
		this.pruneSelection();
		this.version++;
		this.onchange?.();
	}

	/**
	 * Apply one edit: `edit` mutates a draft copy of the comic (and gets the current page's
	 * draft for convenience); only what it changed is written, as one undo step. `group` joins
	 * the step in progress instead (e.g. a balloon growing while its text is typed).
	 */
	change<R>(
		description: string,
		edit: (draft: Comic, page: Page) => R,
		opts: { group?: boolean; origin?: unknown } = {}
	): R {
		const before = projectComic(this.doc);
		const draft = clone(before);
		const result = edit(draft, draft.pages[this.pageIndex]);
		this.history.begin(description, opts);
		applyComic(this.doc, before, draft, opts.origin ?? LOCAL);
		this.history.end(opts);
		return result;
	}

	/**
	 * Set fields on a panel or balloon of the current page. Undefined deletes the field. With
	 * `group`, the change joins the step in progress (a slider being dragged).
	 */
	patch(
		description: string,
		id: string,
		fields: Partial<Balloon> | Partial<Panel>,
		opts: { group?: boolean } = {}
	): void {
		this.change(
			description,
			(_d, page) => {
				const target = Object.assign(find(page, id), fields);
				// Size and roundness set an anchored balloon's overhang.
				if ('anchor' in target && target.anchor) repinAnchors(page);
			},
			opts
		);
	}

	/**
	 * Record a gesture that already changed the live object (a drag, resize, pan): writes the
	 * current values of the keys in `before`. Nothing is written if nothing changed.
	 */
	commit(description: string, target: { id: string }, before: object): void {
		const now = Object.fromEntries(
			Object.keys(before).map((k) => [k, clone((target as Record<string, unknown>)[k])])
		);
		this.change(description, (_d, page) => Object.assign(find(page, target.id), now));
	}

	undo(): void {
		this.history.undo();
	}

	redo(): void {
		this.history.redo();
	}

	/** Replace the document (e.g. from storage); history starts fresh. */
	load(comic: Comic): void {
		this.stopEditing();
		this.exitImageMode();
		this.pageIndex = 0;
		this.selection = { kind: 'none' };
		this.attach(comicToYDoc(comic));
	}

	/** Called synchronously on every document change (autosave hooks in here). */
	onchange: (() => void) | null = null;

	setTitle(title: string): void {
		const trimmed = title.trim();
		if (!trimmed || trimmed === this.comic.title) return;
		this.change('Rename', (d) => (d.title = trimmed), { origin: TITLE });
	}

	/** Pick the style profile generations follow (undefined: none). Undoable. */
	setStyle(profileId: string | undefined): void {
		if (profileId === this.comic.styleProfileId) return;
		this.change(profileId ? 'Change style' : 'Remove style', (d) => {
			if (profileId) d.styleProfileId = profileId;
			else delete d.styleProfileId;
		});
	}

	say(message: string | null): void {
		this.status = message;
	}

	// --- soft hold: someone else is moving it ----------------------------------------------

	/** The other person moving `id` right now, if anyone. */
	heldBy(id: string): Peer | null {
		return this.presence?.heldBy(id) ?? null;
	}

	private noun(id: string): string {
		return this.page.balloons.some((b) => b.id === id) ? 'balloon' : 'panel';
	}

	/** True (and says who) if someone else is moving `id`. */
	private refuseHeld(id: string): boolean {
		const peer = this.heldBy(id);
		if (peer) this.say(`${peer.user.name} is moving this ${this.noun(id)}.`);
		return !!peer;
	}

	/** A drag, resize or pan is starting: claim `id`, unless someone else holds it. */
	beginMove(id: string, rect: Rect): boolean {
		if (this.refuseHeld(id)) return false;
		this.presence?.claim(id, rect);
		return true;
	}

	/** Show the others where it is now. */
	moveTo(rect: Rect): void {
		this.presence?.moveTo(rect);
	}

	/** Still ours? False if a simultaneous grab went to someone who started first. */
	stillMoving(id: string): boolean {
		if (!this.presence || this.presence.holds(id)) return true;
		const winner = this.heldBy(id);
		this.presence.release();
		this.say(`${winner?.user.name ?? 'Someone'} got there first.`);
		return false;
	}

	endMove(): void {
		this.presence?.release();
	}

	// --- selection ------------------------------------------------------------------------

	select(selection: Selection): void {
		const keepEditing = selection.kind === 'balloon' && selection.id === this.editingBalloonId;
		this.selection = selection;
		this.status = null;
		if (this.mode === 'image') this.exitImageMode();
		if (this.mode === 'text' && !keepEditing) this.stopEditing();
	}

	selectPanel(id: string, extend = false): void {
		const current = this.selection.kind === 'panels' ? this.selection.ids : [];
		if (!extend) return this.select({ kind: 'panels', ids: [id] });
		const ids = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
		this.select(ids.length ? { kind: 'panels', ids } : { kind: 'none' });
	}

	/** Drop selected ids that no longer exist (after undo, delete, a collaborator's edit). */
	private pruneSelection(): void {
		const sel = this.selection;
		const page = this.page;
		if (!page) return;
		if (sel.kind === 'panels') {
			const ids = sel.ids.filter((id) => page.panels.some((p) => p.id === id));
			if (ids.length !== sel.ids.length)
				this.selection = ids.length ? { kind: 'panels', ids } : { kind: 'none' };
		} else if (sel.kind === 'band' && !hasBand(page, sel.band)) {
			this.selection = { kind: 'none' };
		} else if (sel.kind === 'balloon' && !page.balloons.some((b) => b.id === sel.id)) {
			this.selection = { kind: 'none' };
			if (this.editingBalloonId === sel.id) this.stopEditing();
		}
		if (this.imagePanelId && !page.panels.some((p) => p.id === this.imagePanelId)) {
			this.exitImageMode();
		}
	}

	// --- header and footer bands -----------------------------------------------------------

	/** The text the current page shows in its bands, tokens filled in. */
	get bands(): Bands {
		return resolveBands(this.comic, this.pageIndex);
	}

	/** The current page's band text before tokens, and which slots it overrides. */
	bandSource<B extends Band>(band: B): { text: Bands[B]; overridden: string[] } {
		return {
			text: bandSource(this.comic.bands, this.page, band),
			overridden: Object.keys(this.page.bands?.[band] ?? {})
		};
	}

	selectBand(band: Band): void {
		this.select(hasBand(this.page, band) ? { kind: 'band', band } : { kind: 'none' });
	}

	/** Set one slot on this page; typing the comic's default back drops the override. */
	setBandText(band: Band, slot: string, value: string): void {
		this.change(`Edit ${band}`, (d, page) => {
			const fallback = (comicBands(d)[band] as unknown as Record<string, string>)[slot];
			if (value === fallback) clearPageBandSlot(page, band, slot);
			else setPageBands(page, { [band]: { [slot]: value } });
		});
	}

	useBandOnEveryPage(band: Band): void {
		this.change(`Use ${band} on every page`, (d) => useOnEveryPage(d, this.pageIndex, band));
		this.say(`Every page now shows this ${band}, unless it has its own.`);
	}

	resetBand(band: Band): void {
		this.change(`Reset ${band}`, (_d, page) => resetPageBands(page, band));
		this.say(`This page’s ${band} is back to the default.`);
	}

	// --- panel operations -----------------------------------------------------------------

	merge(): void {
		const ids = this.selection.kind === 'panels' ? this.selection.ids : [];
		const result = this.change('Merge panels', (_d, page) => mergePanels(page, ids));
		if (!result.ok) return this.say(REASONS[result.reason]);
		this.select({ kind: 'panels', ids: [result.mergedId] });
	}

	split(): void {
		const [panel] = this.selectedPanels;
		if (!panel || panel.kind !== 'grid' || panel.cells.length < 2) {
			return this.say('Select a merged panel to split.');
		}
		this.change('Split panel', (_d, page) => splitPanel(page, panel.id));
		this.select({ kind: 'panels', ids: [panel.id] });
	}

	setGrid(spec: Partial<GridSpec>): void {
		const result = this.change('Change grid', (_d, page) => setGrid(page, spec));
		if (!result.ok) this.say(REASONS[result.reason]);
	}

	addFreePanel(): string {
		const panel = createFreePanel(this.page);
		this.change('Add free panel', (_d, page) => page.panels.push(panel));
		this.select({ kind: 'panels', ids: [panel.id] });
		return panel.id;
	}

	splash(): void {
		this.change('Full-page panel', (_d, page) => splash(page));
	}

	/** Record a completed drag or resize of a free panel or balloon. */
	/**
	 * After a drag or resize. An anchored balloon that was dragged lets go of its corner (in the
	 * same undo step); one that was resized stays anchored and re-seats in its corner.
	 */
	commitGeometry(target: Rect & { id: string }, before: Rect, description: string): void {
		const now = { x: target.x, y: target.y, w: target.w, h: target.h };
		const moved = now.w === before.w && now.h === before.h;
		this.change(description, (_d, page) => {
			const t = find(page, target.id) as Rect & { anchor?: BalloonAnchor };
			Object.assign(t, now);
			if (!t.anchor || !page.balloons.some((b) => b.id === target.id)) return;
			if (moved) delete t.anchor;
			else repinAnchors(page);
		});
	}

	// --- anchoring a balloon to a panel corner ----------------------------------------------

	/** The panel the selected balloon is (or would be) anchored to: its own, else the one under it. */
	anchorPanel(): Panel | undefined {
		const b = this.selectedBalloon;
		if (!b) return undefined;
		const own = b.anchor && this.page.panels.find((p) => p.id === b.anchor!.panelId);
		return own || panelNear(this.page, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
	}

	/** Connect the selected balloon to the next line, or unlink it; says why if it can't. */
	setNext(nextId: string | null): void {
		const b = this.selectedBalloon;
		if (!b) return;
		try {
			this.change(nextId ? 'Connect balloons' : 'Disconnect balloons', (_d, page) =>
				connectBalloons(page, b.id, nextId)
			);
		} catch (e) {
			this.say((e as Error).message);
		}
	}

	setConnector(kind: 'neck' | 'line'): void {
		const b = this.selectedBalloon;
		if (!b?.next) return;
		this.patch('Connector', b.id, { connector: kind === 'neck' ? undefined : kind });
	}

	setAnchor(corner: Corner | null): void {
		const b = this.selectedBalloon;
		const panel = this.anchorPanel();
		if (!b || (corner && !panel)) return;
		this.change(corner ? 'Anchor balloon' : 'Release balloon', (_d, page) => {
			if (corner) anchorBalloon(page, b.id, { panelId: panel!.id, corner });
			else delete page.balloons.find((x) => x.id === b.id)!.anchor;
		});
	}

	get selectedBalloon(): Balloon | undefined {
		const sel = this.selection;
		return sel.kind === 'balloon' ? this.page.balloons.find((b) => b.id === sel.id) : undefined;
	}

	/** The single selected free panel or balloon that arrows and z-order act on. */
	get movable(): (Rect & { id: string; z: number }) | undefined {
		if (this.selectedBalloon) return this.selectedBalloon;
		const [panel] = this.selectedPanels;
		return this.selectedPanels.length === 1 && panel.kind === 'free' ? panel : undefined;
	}

	startEditing(id = this.selectedBalloon?.id, selectAll = false): boolean {
		if (!id || !this.page.balloons.some((b) => b.id === id)) return false;
		this.select({ kind: 'balloon', id });
		this.selectAllOnEdit = selectAll;
		this.editingBalloonId = id;
		this.mode = 'text';
		return true;
	}

	/** Leaving text mode unmounts TipTap; its text is already in the doc (see rich-text.ts). */
	stopEditing(): void {
		this.mode = 'select';
		this.editingBalloonId = null;
	}

	/** Add a balloon inside the selected panel (or the page) and select it. */
	addBalloon(type: BalloonType): string {
		const [panel] = this.selectedPanels;
		const box = panel ? panelBox(this.page, panel) : undefined;
		const balloon = createBalloon(this.page, type, box);
		this.change(`Add ${type}`, (_d, page) => page.balloons.push(balloon));
		this.startEditing(balloon.id, true);
		return balloon.id;
	}

	nudge(dx: number, dy: number): boolean {
		const target = this.movable;
		if (!target) return false;
		if (this.refuseHeld(target.id)) return true;
		this.change('Nudge', (_d, page) => {
			const t = find(page, target.id) as Rect & { anchor?: BalloonAnchor };
			t.x += dx;
			t.y += dy;
			delete t.anchor;
		});
		return true;
	}

	reorder(to: 'front' | 'back'): void {
		const target = this.movable;
		if (!target || this.refuseHeld(target.id)) return;
		const zs = this.selectedBalloon
			? this.page.balloons.map((b) => b.z)
			: this.page.panels.filter((p): p is FreePanel => p.kind === 'free').map((p) => p.z);
		const z = to === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
		this.patch(to === 'front' ? 'Bring to front' : 'Send to back', target.id, { z });
	}

	/** Delete removes free panels; on a lone grid panel it removes the image instead. */
	deleteSelection(): void {
		const balloon = this.selectedBalloon;
		if (balloon) {
			if (this.refuseHeld(balloon.id)) return;
			this.change(`Delete ${balloon.type}`, (_d, page) => removeBalloon(page, balloon.id));
			return this.select({ kind: 'none' });
		}
		const free = this.selectedPanels.filter((p) => p.kind === 'free').map((p) => p.id);
		const [only] = this.selectedPanels;
		if (!free.length && only?.image) return this.removeImage(only);
		if (!free.length || free.some((id) => this.refuseHeld(id))) return;
		this.change('Delete panel', (_d, page) => {
			page.panels = page.panels.filter((p) => !free.includes(p.id));
		});
		this.select({ kind: 'none' });
	}

	// --- images ---------------------------------------------------------------------------

	get imagePanel(): Panel | undefined {
		return this.page.panels.find((p) => p.id === this.imagePanelId);
	}

	/** Store the blob and place it in the panel, filling it. */
	async setImage(panelId: string, blob: Blob): Promise<void> {
		if (!blob.type.startsWith('image/')) return this.say('That file is not an image.');
		const stored = await addImage(blob);
		const panel = this.page.panels.find((p) => p.id === panelId);
		if (!panel) return;
		const placement = fitImage(stored, panelBox(this.page, panel), 'fill');
		this.patch('Set image', panelId, { image: { ...stored, ...placement } });
		this.select({ kind: 'panels', ids: [panelId] });
	}

	/**
	 * Place an image that is already stored (a generated one) in a panel on any page, filling
	 * it, with `extra` fields (its prompt) in the same undo step. False if the panel has gone.
	 */
	placeStoredImage(
		panelId: string,
		stored: { assetId: string; naturalWidth: number; naturalHeight: number },
		extra: Partial<Panel> = {},
		description = 'Generate image'
	): boolean {
		const at = this.comic.pages.find((p) => p.panels.some((q) => q.id === panelId));
		if (!at) return false;
		this.change(description, (d) => {
			const page = d.pages.find((p) => p.id === at.id)!;
			const panel = page.panels.find((p) => p.id === panelId)!;
			const placement = fitImage(stored, panelBox(page, panel), 'fill');
			Object.assign(panel, extra, { image: { ...stored, ...placement } });
		});
		return true;
	}

	/**
	 * Swap a panel's image (`fromAssetId`) for its print version, keeping the framing: the same
	 * offsets, and a scale that covers the same area. False if the panel shows something else now.
	 */
	placePrintVersion(
		panelId: string,
		fromAssetId: string,
		stored: { assetId: string; naturalWidth: number; naturalHeight: number }
	): boolean {
		const at = this.comic.pages.find((p) =>
			p.panels.some((q) => q.id === panelId && q.image?.assetId === fromAssetId)
		);
		if (!at) return false;
		this.change('Print version', (d) => {
			const panel = d.pages.find((p) => p.id === at.id)!.panels.find((p) => p.id === panelId)!;
			const old = panel.image!;
			panel.image = {
				...stored,
				offsetX: old.offsetX,
				offsetY: old.offsetY,
				scale: old.scale * (old.naturalWidth / stored.naturalWidth)
			};
		});
		return true;
	}

	removeImage(panel: Panel): void {
		if (panel.image) this.patch('Remove image', panel.id, { image: undefined });
	}

	enterImageMode(): boolean {
		const [panel] = this.selectedPanels;
		if (this.selectedPanels.length !== 1 || !panel.image) return false;
		this.mode = 'image';
		this.imagePanelId = panel.id;
		return true;
	}

	exitImageMode(): void {
		this.mode = 'select';
		this.imagePanelId = null;
	}

	private placeImage(description: string, place: (panel: Panel) => Panel['image']): void {
		const panel = this.imagePanel ?? this.selectedPanels[0];
		if (!panel?.image || this.refuseHeld(panel.id)) return;
		this.patch(description, panel.id, { image: place(panel) });
	}

	fitSelectedImage(mode: 'fill' | 'fit'): void {
		this.placeImage(mode === 'fill' ? 'Fill panel' : 'Fit image', (panel) => ({
			...panel.image!,
			...fitImage(panel.image!, panelBox(this.page, panel), mode)
		}));
	}

	panSelectedImage(dx: number, dy: number): void {
		this.placeImage('Pan image', (panel) => panImage(panel.image!, { dx, dy }));
	}

	zoomSelectedImage(factor: number): void {
		this.placeImage('Zoom image', (panel) => {
			const box = panelBox(this.page, panel);
			return zoomImage(panel.image!, factor, { x: box.w / 2, y: box.h / 2 });
		});
	}

	// --- pages & view ---------------------------------------------------------------------

	addPage(): void {
		const page = createPage(this.page.grid, this.page);
		const at = this.pageIndex + 1;
		this.change('Add page', (d) => d.pages.splice(at, 0, page));
		this.goToPage(at);
	}

	deletePage(): void {
		if (this.comic.pages.length === 1) return this.say("Can't delete the last page.");
		const index = this.pageIndex;
		this.select({ kind: 'none' });
		this.change('Delete page', (d) => d.pages.splice(index, 1));
		this.pageIndex = Math.min(index, this.comic.pages.length - 1);
	}

	movePage(delta: number): void {
		const from = this.pageIndex;
		const to = from + delta;
		if (to < 0 || to >= this.comic.pages.length) return;
		this.change('Move page', (d) => d.pages.splice(to, 0, ...d.pages.splice(from, 1)));
		this.pageIndex = to;
	}

	goToPage(index: number): void {
		if (index < 0 || index >= this.comic.pages.length) return;
		this.select({ kind: 'none' });
		this.pageIndex = index;
	}

	zoomBy(factor: number, fit: number): void {
		const current = this.zoom ?? fit;
		this.zoom = Math.min(4, Math.max(0.1, current * factor));
	}
}

/** A panel or balloon of `page` by id (throws if it has gone: callers check selection first). */
function find(page: Page, id: string): Panel | Balloon {
	const found = page.panels.find((p) => p.id === id) ?? page.balloons.find((b) => b.id === id);
	if (!found) throw new Error(`No panel or balloon ${id} on this page.`);
	return found;
}

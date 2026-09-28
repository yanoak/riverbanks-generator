// Editor state: the comic document, selection, mode and history. Components read from it;
// every document change goes through run() or record(), so undo, redo and autosave all see it.

import { HistoryManager } from '$lib/history/history.svelte';
import type { Editor as TipTap } from '@tiptap/core';
import { BatchCommand, type Command } from '$lib/history/command';
import { InsertCommand, MoveCommand, RemoveCommand } from '$lib/model/commands/list';
import {
	createFreePanel,
	MergePanelsCommand,
	SetGridCommand,
	splashCommand,
	SplitPanelCommand
} from '$lib/model/commands/panels';
import { PatchCommand } from '$lib/model/commands/patch';
import { createComic, createPage } from '$lib/model/factory';
import { createBalloon } from '$lib/model/balloons';
import { REASONS } from '$lib/model/reasons';
import { fitImage, panImage, zoomImage } from '$lib/geometry/image';
import { panelBox } from '$lib/geometry/panel';
import { addImage } from '$lib/persistence/assets.svelte';
import type {
	Balloon,
	BalloonType,
	Comic,
	FreePanel,
	GridSpec,
	Page,
	Panel,
	Rect
} from '$lib/model/types';

export type Selection =
	{ kind: 'none' } | { kind: 'panels'; ids: string[] } | { kind: 'balloon'; id: string };

export type Mode = 'select' | 'image' | 'text';

export class Editor {
	comic = $state<Comic>(createComic());
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
	readonly history = new HistoryManager();

	get page(): Page {
		return this.comic.pages[this.pageIndex];
	}

	get selectedPanels(): Panel[] {
		const sel = this.selection;
		if (sel.kind !== 'panels') return [];
		return sel.ids.map((id) => this.page.panels.find((p) => p.id === id)).filter((p) => !!p);
	}

	run(command: Command): void {
		this.history.execute(command);
		this.changed();
	}

	/** For gestures that already applied their change live (drags). */
	record(command: Command | null): void {
		if (!command) return;
		this.history.record(command);
		this.changed();
	}

	undo(): void {
		this.history.undo();
		this.afterHistory();
	}

	redo(): void {
		this.history.redo();
		this.afterHistory();
	}

	private afterHistory(): void {
		this.pageIndex = Math.min(this.pageIndex, this.comic.pages.length - 1);
		this.pruneSelection();
		this.changed();
	}

	/** Replace the document (e.g. from storage); history starts fresh. */
	load(comic: Comic): void {
		this.stopEditing();
		this.exitImageMode();
		this.comic = comic;
		this.pageIndex = 0;
		this.selection = { kind: 'none' };
		this.history.clear();
	}

	/** Mark the document changed without a history entry (e.g. renaming the comic). */
	changed(): void {
		this.version++;
	}

	say(message: string | null): void {
		this.status = message;
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

	/** Drop selected ids that no longer exist (after undo, delete, page switch). */
	private pruneSelection(): void {
		const sel = this.selection;
		if (sel.kind === 'panels') {
			const ids = sel.ids.filter((id) => this.page.panels.some((p) => p.id === id));
			this.selection = ids.length ? { kind: 'panels', ids } : { kind: 'none' };
		} else if (sel.kind === 'balloon' && !this.page.balloons.some((b) => b.id === sel.id)) {
			this.selection = { kind: 'none' };
		}
	}

	// --- panel operations -----------------------------------------------------------------

	merge(): void {
		const ids = this.selection.kind === 'panels' ? this.selection.ids : [];
		const result = MergePanelsCommand.create(this.page, ids);
		if (!result.ok) return this.say(REASONS[result.reason]);
		this.run(result.command);
		this.select({ kind: 'panels', ids: [result.mergedId] });
	}

	split(): void {
		const [panel] = this.selectedPanels;
		if (!panel || panel.kind !== 'grid' || panel.cells.length < 2) {
			return this.say('Select a merged panel to split.');
		}
		this.run(new SplitPanelCommand(this.page, panel.id));
		this.select({ kind: 'panels', ids: [panel.id] });
	}

	setGrid(spec: Partial<GridSpec>): void {
		const result = SetGridCommand.create(this.page, spec);
		if (!result.ok) return this.say(REASONS[result.reason]);
		this.run(result.command);
		this.pruneSelection();
	}

	addFreePanel(): string {
		const panel = createFreePanel(this.page);
		this.run(new InsertCommand('Add free panel', this.page.panels, panel));
		this.select({ kind: 'panels', ids: [panel.id] });
		return panel.id;
	}

	splash(): void {
		this.run(splashCommand(this.page));
		this.pruneSelection();
	}

	/** Record a completed drag or resize of a free panel or balloon. */
	commitGeometry(target: Rect, before: Rect, description: string): void {
		this.record(PatchCommand.fromChange(description, target, before));
	}

	get selectedBalloon(): Balloon | undefined {
		const sel = this.selection;
		return sel.kind === 'balloon' ? this.page.balloons.find((b) => b.id === sel.id) : undefined;
	}

	/** The single selected free panel or balloon that arrows and z-order act on. */
	get movable(): (Rect & { z: number }) | undefined {
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

	/** Leaving text mode unmounts TipTap, which commits the text (see rich-text.ts). */
	stopEditing(): void {
		this.mode = 'select';
		this.editingBalloonId = null;
	}

	/** Add a balloon inside the selected panel (or the page) and select it. */
	addBalloon(type: BalloonType): string {
		const [panel] = this.selectedPanels;
		const box = panel ? panelBox(this.page, panel) : undefined;
		const balloon = createBalloon(this.page, type, box);
		this.run(new InsertCommand(`Add ${type}`, this.page.balloons, balloon));
		this.startEditing(balloon.id, true);
		return balloon.id;
	}

	nudge(dx: number, dy: number): boolean {
		const target = this.movable;
		if (!target) return false;
		this.run(new PatchCommand('Nudge', target, { x: target.x + dx, y: target.y + dy }));
		return true;
	}

	reorder(to: 'front' | 'back'): void {
		const target = this.movable;
		if (!target) return;
		const zs = this.selectedBalloon
			? this.page.balloons.map((b) => b.z)
			: this.page.panels.filter((p): p is FreePanel => p.kind === 'free').map((p) => p.z);
		const z = to === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
		this.run(new PatchCommand(to === 'front' ? 'Bring to front' : 'Send to back', target, { z }));
	}

	/** Delete removes free panels; on a lone grid panel it removes the image instead. */
	deleteSelection(): void {
		const balloon = this.selectedBalloon;
		if (balloon) {
			this.run(new RemoveCommand(`Delete ${balloon.type}`, this.page.balloons, balloon));
			return this.select({ kind: 'none' });
		}
		const free = this.selectedPanels.filter((p) => p.kind === 'free');
		const [only] = this.selectedPanels;
		if (!free.length && only?.image) return this.removeImage(only);
		if (!free.length) return;
		this.run(
			new BatchCommand(
				'Delete panel',
				free.map((p) => new RemoveCommand('Delete panel', this.page.panels, p))
			)
		);
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
		this.run(new PatchCommand('Set image', panel, { image: { ...stored, ...placement } }));
		this.select({ kind: 'panels', ids: [panelId] });
	}

	removeImage(panel: Panel): void {
		if (panel.image) this.run(new PatchCommand('Remove image', panel, { image: undefined }));
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
		if (!panel?.image) return;
		this.run(new PatchCommand(description, panel, { image: place(panel) }));
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
		const page = createPage(this.page.grid);
		this.run(new InsertCommand('Add page', this.comic.pages, page, this.pageIndex + 1));
		this.goToPage(this.pageIndex + 1);
	}

	deletePage(): void {
		if (this.comic.pages.length === 1) return this.say("Can't delete the last page.");
		const index = this.pageIndex;
		this.select({ kind: 'none' });
		this.run(new RemoveCommand('Delete page', this.comic.pages, this.page));
		this.pageIndex = Math.min(index, this.comic.pages.length - 1);
	}

	movePage(delta: number): void {
		const to = this.pageIndex + delta;
		if (to < 0 || to >= this.comic.pages.length) return;
		this.run(new MoveCommand('Move page', this.comic.pages, this.page, to));
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

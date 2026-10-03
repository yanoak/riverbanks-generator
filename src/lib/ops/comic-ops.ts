// Tool-level operations on a loaded comic. Each runs the same model commands as the editor and
// throws OpError('invalid', …) with the editor's own wording when the model refuses.

import { fillPercent, fitImage, focusImage, imageFocus, setFillPercent } from '$lib/geometry/image';
import { panelBox } from '$lib/geometry/panel';
import {
	anchorBalloon,
	connectBalloons,
	createBalloon,
	removeBalloon,
	repinAnchors,
	ROTATES
} from '$lib/model/balloons';
import {
	createFreePanel,
	mergePanels as merge,
	setGrid as reshape,
	splitPanel as split
} from '$lib/model/panels';
import {
	bandShown,
	hasBand,
	resetPageBands,
	resolveBands,
	setBandShown,
	setDefaultBands,
	setPageBands,
	type BandsPatch
} from '$lib/model/bands';
import { createPage } from '$lib/model/factory';
import { isColour } from '$lib/model/page';
import { gridPanels } from '$lib/model/invariants';
import { REASONS } from '$lib/model/reasons';
import type {
	Balloon,
	BalloonAnchor,
	BalloonType,
	Comic,
	GridSpec,
	Page,
	Panel,
	Point,
	Rect
} from '$lib/model/types';
import { invalid } from './ops';
import { markdownToHtml } from './text';

const TAILED: BalloonType[] = ['speech', 'whisper', 'thought', 'shout'];

function panelIn(page: Page, id: string): Panel {
	const panel = page.panels.find((p) => p.id === id);
	if (!panel) throw invalid(`No panel ${id} on this page. Call get_comic for current ids.`);
	return panel;
}

function balloonIn(page: Page, id: string): Balloon {
	const balloon = page.balloons.find((b) => b.id === id);
	if (!balloon) throw invalid(`No balloon ${id} on this page. Call get_comic for current ids.`);
	return balloon;
}

export function pageAt(comic: Comic, n: number): Page {
	const page = comic.pages[n - 1];
	if (!page) throw invalid(`There is no page ${n}; the comic has ${comic.pages.length}.`);
	return page;
}

/** Merge by grid cells (0-based, row-major) or by panel ids. */
export function mergePanels(
	comic: Comic,
	args: { page: number; cells?: number[]; panelIds?: string[] }
): string {
	const page = pageAt(comic, args.page);
	const panels = gridPanels(page);
	const ids =
		args.panelIds ??
		[...new Set((args.cells ?? []).map((c) => panels.find((p) => p.cells.includes(c))?.id))].filter(
			(id): id is string => !!id
		);
	const result = merge(page, ids);
	if (!result.ok) throw invalid(REASONS[result.reason]);
	const merged = gridPanels(page).find((p) => p.id === result.mergedId)!;
	return `Merged ${merged.cells.length} cells into panel ${merged.id} on page ${args.page}.`;
}

// --- pages ---------------------------------------------------------------------------------

export function addPage(comic: Comic, args: { after?: number; grid?: Partial<GridSpec> }): string {
	const after = args.after ?? comic.pages.length;
	if (after < 0 || after > comic.pages.length) throw invalid(`Can't add after page ${after}.`);
	const template = comic.pages[Math.max(0, after - 1)];
	comic.pages.splice(after, 0, createPage({ ...template?.grid, ...args.grid }, template));
	return `Added page ${after + 1} (the comic now has ${comic.pages.length} pages).`;
}

export function deletePage(comic: Comic, args: { page: number }): string {
	pageAt(comic, args.page);
	if (comic.pages.length === 1) throw invalid("Can't delete the last page.");
	comic.pages.splice(args.page - 1, 1);
	return `Deleted page ${args.page}.`;
}

export function movePage(comic: Comic, args: { page: number; to: number }): string {
	const page = pageAt(comic, args.page);
	pageAt(comic, args.to);
	comic.pages.splice(args.page - 1, 1);
	comic.pages.splice(args.to - 1, 0, page);
	return `Moved page ${args.page} to position ${args.to}.`;
}

/**
 * Header and footer text: the comic's defaults when `page` is omitted, else that page's
 * overrides. `reset` first returns the page to the defaults.
 */
/** A page's own look; for now its background colour (null returns it to white). */
export function setPage(comic: Comic, args: { page: number; background?: string | null }): string {
	const page = pageAt(comic, args.page);
	if (args.background === null) delete page.background;
	else if (args.background !== undefined) {
		if (!isColour(args.background)) throw invalid('The background must be a colour, #rrggbb.');
		page.background = args.background.toLowerCase();
	}
	return `Page ${args.page} background: ${page.background ?? 'white'}.`;
}

export function setBands(
	comic: Comic,
	args: BandsPatch & {
		page?: number;
		reset?: boolean;
		show?: { header?: boolean; footer?: boolean };
	}
): string {
	const { page: n, reset, show, ...patch } = args;
	if (show && n === undefined) throw invalid('Give a page to switch its bands on or off.');
	if (n === undefined) {
		setDefaultBands(comic, patch);
		const b = comic.bands!;
		return `Every page's header is now “${b.header.title} / ${b.header.subtitle}” and footer “${b.footer.left} · ${b.footer.center} · ${b.footer.right}”, unless a page overrides it.`;
	}
	const page = pageAt(comic, n);
	for (const band of ['header', 'footer'] as const) {
		const has = band === 'header' ? page.grid.top : page.grid.bottom;
		if (patch[band] && !has) throw invalid(`Page ${n} has no ${band} band.`);
	}
	if (reset) resetPageBands(page);
	setPageBands(page, patch);
	for (const band of ['header', 'footer'] as const) {
		if (show?.[band] === undefined) continue;
		if (!hasBand(page, band)) throw invalid(`Page ${n} has no ${band} band.`);
		setBandShown(page, band, show[band]);
	}
	const { header, footer } = resolveBands(comic, n - 1);
	const state = (band: 'header' | 'footer') => (bandShown(page, band) ? '' : ' (off)');
	return `Page ${n} header${state('header')}: “${header.title} / ${header.subtitle}”; footer${state('footer')}: “${footer.left} · ${footer.center} · ${footer.right}”.`;
}

export function setGrid(comic: Comic, args: { page: number } & Partial<GridSpec>): string {
	const { page: n, ...spec } = args;
	const page = pageAt(comic, n);
	const result = reshape(page, spec);
	if (!result.ok) throw invalid(REASONS[result.reason]);
	const g = page.grid;
	return `Page ${n} grid is now ${g.rows}×${g.cols}, gutter ${g.gutter}, margin ${g.margin}.`;
}

// --- panels --------------------------------------------------------------------------------

export function splitPanel(comic: Comic, args: { page: number; panelId: string }): string {
	const page = pageAt(comic, args.page);
	const panel = panelIn(page, args.panelId);
	if (panel.kind !== 'grid' || panel.cells.length < 2)
		throw invalid('Only merged grid panels can be split.');
	const cells = panel.cells.length;
	split(page, panel.id);
	return `Split panel ${panel.id} into ${cells} panels.`;
}

export function addFreePanel(
	comic: Comic,
	args: { page: number; rect?: Rect; border?: 'solid' | 'none'; fill?: string }
): { id: string; summary: string } {
	const page = pageAt(comic, args.page);
	const panel = { ...createFreePanel(page), ...args.rect };
	if (args.border) panel.border = args.border;
	if (args.fill) panel.fill = args.fill;
	page.panels.push(panel);
	return { id: panel.id, summary: `Added free panel ${panel.id} on page ${args.page}.` };
}

export function updatePanel(
	comic: Comic,
	args: {
		page: number;
		panelId: string;
		rect?: Rect;
		border?: 'solid' | 'none';
		fill?: string;
		z?: number;
		/** Reset to fill/fit, then size (% of filling the panel), then the point to centre. */
		image?: {
			fit?: 'fill' | 'fit';
			size?: number;
			focus?: { x: number; y: number };
		};
	}
): string {
	const page = pageAt(comic, args.page);
	const panel = panelIn(page, args.panelId);
	if ((args.rect || args.z !== undefined) && panel.kind !== 'free') {
		throw invalid(
			'Only free panels can be moved, resized or re-stacked; grid panels follow the grid.'
		);
	}
	if (panel.kind === 'free') {
		if (args.rect) Object.assign(panel, args.rect);
		if (args.z !== undefined) panel.z = args.z;
	}
	if (args.border) panel.border = args.border;
	if (args.fill) panel.fill = args.fill;
	if (args.image) {
		if (!panel.image) throw invalid(`Panel ${panel.id} has no image to crop.`);
		const box = panelBox(page, panel);
		let img = panel.image;
		if (args.image.fit) img = { ...img, ...fitImage(img, box, args.image.fit) };
		if (args.image.size !== undefined) img = setFillPercent(img, box, args.image.size);
		if (args.image.focus) img = focusImage(img, box, args.image.focus);
		panel.image = img;
		const focus = imageFocus(img, box);
		return `Updated panel ${panel.id}: its image is at ${Math.round(fillPercent(img, box))}% of filling the panel, centred on (${focus.x.toFixed(2)}, ${focus.y.toFixed(2)}).`;
	}
	return `Updated panel ${panel.id}.`;
}

export function setPanelImage(
	comic: Comic,
	args: {
		page: number;
		panelId: string;
		image: { assetId: string; naturalWidth: number; naturalHeight: number };
		fit?: 'fill' | 'fit';
		/** Zoom past the fit (GENERATED_OVERSCAN for generated images). */
		overscan?: number;
	}
): string {
	const page = pageAt(comic, args.page);
	const panel = panelIn(page, args.panelId);
	panel.image = {
		...args.image,
		...fitImage(args.image, panelBox(page, panel), args.fit ?? 'fill', args.overscan)
	};
	return `Placed image in panel ${panel.id} (${args.fit ?? 'fill'}).`;
}

export function removePanelImage(comic: Comic, args: { page: number; panelId: string }): string {
	const panel = panelIn(pageAt(comic, args.page), args.panelId);
	delete panel.image;
	return `Removed the image from panel ${panel.id}.`;
}

// --- balloons ------------------------------------------------------------------------------

/** A balloon's shape settings; null hands one back to the default for its type. */
export interface ShapeArgs {
	roundness?: number | null;
	points?: number | null;
	depth?: number | null;
	/** Anchor to a panel corner (cut off flush by its border); null lets go. */
	anchor?: BalloonAnchor | null;
	/** Connect to the next balloon in the exchange; null unlinks. */
	next?: string | null;
	connector?: 'neck' | 'line';
	/** Tilt in degrees for an sfx (its lettering) or a caption (the box); null resets it. */
	rotation?: number | null;
	/** Draw a caption as a pennant pointed at this end; null makes it a plain box again. */
	point?: 'left' | 'right' | null;
}

function applyShape(page: Page, b: Balloon, args: ShapeArgs) {
	for (const key of ['roundness', 'points', 'depth'] as const) {
		const v = args[key];
		if (v === null) delete b[key];
		else if (v !== undefined) b[key] = v;
	}
	if (args.rotation !== undefined) {
		if (!ROTATES.includes(b.type)) throw invalid('Only sfx and caption balloons rotate.');
		if (args.rotation === null) delete b.rotation;
		else b.rotation = args.rotation;
	}
	if (args.point !== undefined) {
		if (args.point === null) delete b.point;
		else if (b.type !== 'caption') throw invalid('Only a caption can be pointed.');
		else b.point = args.point;
	}
	if (args.anchor === null) delete b.anchor;
	else if (args.anchor) {
		panelIn(page, args.anchor.panelId);
		anchorBalloon(page, b.id, args.anchor);
	} else if (b.anchor) repinAnchors(page); // a new size or roundness changes the overhang
	if (args.next !== undefined) {
		try {
			connectBalloons(page, b.id, args.next);
		} catch (e) {
			throw invalid((e as Error).message);
		}
	}
	if (args.connector) {
		if (!b.next) throw invalid('Only a connected balloon has a connector; set next first.');
		if (args.connector === 'neck') delete b.connector;
		else b.connector = args.connector;
	}
}

export function addBalloon(
	comic: Comic,
	args: {
		page: number;
		type: BalloonType;
		text: string;
		panelId?: string;
		rect?: Rect;
		tailTip?: Point;
	} & ShapeArgs
): { id: string; summary: string } {
	const page = pageAt(comic, args.page);
	const box = args.panelId ? panelBox(page, panelIn(page, args.panelId)) : undefined;
	const balloon = createBalloon(page, args.type, box);
	if (args.rect) Object.assign(balloon, args.rect);
	balloon.html = markdownToHtml(args.text);
	page.balloons.push(balloon);
	applyShape(page, balloon, args);
	if (args.tailTip && TAILED.includes(args.type)) {
		balloon.tail = { x: args.tailTip.x - balloon.x, y: args.tailTip.y - balloon.y };
	}
	return { id: balloon.id, summary: `Added ${args.type} ${balloon.id} on page ${args.page}.` };
}

export function updateBalloon(
	comic: Comic,
	args: {
		page: number;
		balloonId: string;
		text?: string;
		type?: BalloonType;
		rect?: Rect;
		tailTip?: Point | null;
		fontSize?: number;
		font?: string;
		fill?: string;
		/** A title's accent colour, for its ==marked== words (kept in stroke). */
		accent?: string;
	} & ShapeArgs
): string {
	const page = pageAt(comic, args.page);
	const b = balloonIn(page, args.balloonId);
	if (args.accent && (args.type ?? b.type) !== 'title')
		throw invalid('Only title lettering has an accent colour.');
	if (args.text !== undefined) b.html = markdownToHtml(args.text);
	if (args.type) b.type = args.type;
	if (args.rect) Object.assign(b, args.rect);
	if (args.fontSize) b.fontSize = args.fontSize;
	if (args.font) b.font = args.font;
	else if (args.font === '') delete b.font;
	if (args.fill) b.fill = args.fill;
	if (args.accent) b.stroke = args.accent;
	if (args.tailTip === null || !TAILED.includes(b.type)) delete b.tail;
	else if (args.tailTip) b.tail = { x: args.tailTip.x - b.x, y: args.tailTip.y - b.y };
	applyShape(page, b, args);
	return `Updated balloon ${b.id}.`;
}

export function deleteBalloon(comic: Comic, args: { page: number; balloonId: string }): string {
	const page = pageAt(comic, args.page);
	const b = balloonIn(page, args.balloonId);
	removeBalloon(page, b.id);
	return `Deleted balloon ${b.id}.`;
}

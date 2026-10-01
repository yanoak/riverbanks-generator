// Tool-level operations on a loaded comic. Each runs the same model commands as the editor and
// throws OpError('invalid', …) with the editor's own wording when the model refuses.

import { fitImage } from '$lib/geometry/image';
import { panelBox } from '$lib/geometry/panel';
import {
	anchorBalloon,
	connectBalloons,
	createBalloon,
	removeBalloon,
	repinAnchors
} from '$lib/model/balloons';
import {
	createFreePanel,
	mergePanels as merge,
	setGrid as reshape,
	splitPanel as split
} from '$lib/model/panels';
import {
	resetPageBands,
	resolveBands,
	setDefaultBands,
	setPageBands,
	type BandsPatch
} from '$lib/model/bands';
import { createPage } from '$lib/model/factory';
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
export function setBands(
	comic: Comic,
	args: BandsPatch & { page?: number; reset?: boolean }
): string {
	const { page: n, reset, ...patch } = args;
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
	const { header, footer } = resolveBands(comic, n - 1);
	return `Page ${n} header: “${header.title} / ${header.subtitle}”; footer: “${footer.left} · ${footer.center} · ${footer.right}”.`;
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
	}
): string {
	const panel = panelIn(pageAt(comic, args.page), args.panelId);
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
	return `Updated panel ${panel.id}.`;
}

export function setPanelImage(
	comic: Comic,
	args: {
		page: number;
		panelId: string;
		image: { assetId: string; naturalWidth: number; naturalHeight: number };
		fit?: 'fill' | 'fit';
	}
): string {
	const page = pageAt(comic, args.page);
	const panel = panelIn(page, args.panelId);
	panel.image = {
		...args.image,
		...fitImage(args.image, panelBox(page, panel), args.fit ?? 'fill')
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
	/** An sfx's lettering angle in degrees; null resets it to the −6° tilt. */
	rotation?: number | null;
}

function applyShape(page: Page, b: Balloon, args: ShapeArgs) {
	for (const key of ['roundness', 'points', 'depth'] as const) {
		const v = args[key];
		if (v === null) delete b[key];
		else if (v !== undefined) b[key] = v;
	}
	if (args.rotation !== undefined) {
		if (b.type !== 'sfx') throw invalid('Only sfx lettering rotates.');
		if (args.rotation === null) delete b.rotation;
		else b.rotation = args.rotation;
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
	} & ShapeArgs
): string {
	const page = pageAt(comic, args.page);
	const b = balloonIn(page, args.balloonId);
	if (args.text !== undefined) b.html = markdownToHtml(args.text);
	if (args.type) b.type = args.type;
	if (args.rect) Object.assign(b, args.rect);
	if (args.fontSize) b.fontSize = args.fontSize;
	if (args.font) b.font = args.font;
	else if (args.font === '') delete b.font;
	if (args.fill) b.fill = args.fill;
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

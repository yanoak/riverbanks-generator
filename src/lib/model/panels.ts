// Partition-changing panel edits. Each mutates a draft page in place (the editor and the MCP
// tools both edit a draft copy and write back the difference, see ydoc.ts applyComic), and
// returns a refusal reason instead of throwing so the UI can explain it.

import { canMerge } from '$lib/geometry/grid';
import { clone } from './clone';
import { newId, singleCellPanels } from './factory';
import { gridPanels } from './invariants';
import type { FreePanel, GridPanel, GridSpec, Page } from './types';

type Rejected<R extends string> = { ok: false; reason: R };

/**
 * The merged panel keeps the first selected panel's id and style, and the image of the first
 * selected panel that has one.
 */
export function mergePanels(
	page: Page,
	panelIds: string[]
): { ok: true; mergedId: string } | Rejected<'need-two' | 'not-contiguous' | 'has-hole'> {
	const byId = new Map(gridPanels(page).map((p) => [p.id, p]));
	const selected = [...new Set(panelIds)].map((id) => byId.get(id)).filter((p) => !!p);
	if (selected.length < 2) return { ok: false, reason: 'need-two' };

	const cells = selected.flatMap((p) => p.cells).sort((a, b) => a - b);
	const check = canMerge(cells, page.grid);
	if (!check.ok) return check;

	const first = selected[0];
	const merged: GridPanel = {
		...clone(first),
		cells,
		image: clone(selected.find((p) => p.image)?.image)
	};
	if (!merged.image) delete merged.image;

	const drop = new Set(selected.map((p) => p.id));
	page.panels = page.panels.flatMap((p) =>
		p.id === first.id ? [merged] : drop.has(p.id) ? [] : [p]
	);
	return { ok: true, mergedId: first.id };
}

/** Back to single cells; the first cell keeps the id and the image. */
export function splitPanel(page: Page, panelId: string): void {
	page.panels = page.panels.flatMap((p) => {
		if (p.id !== panelId || p.kind !== 'grid') return [p];
		const [first, ...rest] = [...p.cells].sort((a, b) => a - b);
		const { image, ...style } = clone(p);
		return [
			{ ...style, cells: [first], ...(image ? { image } : {}) },
			...rest.map((cell) => ({ ...style, id: newId(), cells: [cell] }))
		];
	});
}

/** Rows/cols can only change while every grid panel is a single cell. */
export function setGrid(
	page: Page,
	spec: Partial<GridSpec>
): { ok: true } | Rejected<'has-merges' | 'invalid'> {
	const before = page.grid;
	const next = { ...before, ...spec };
	if (next.rows < 1 || next.cols < 1 || next.gutter < 0 || next.margin < 0) {
		return { ok: false, reason: 'invalid' };
	}
	const reshaped = next.rows !== before.rows || next.cols !== before.cols;
	if (reshaped && gridPanels(page).some((p) => p.cells.length > 1)) {
		return { ok: false, reason: 'has-merges' };
	}
	page.grid = next;
	if (!reshaped) return { ok: true };
	// Keep the panel (and its image) wherever the same row/col still exists.
	const old = new Map(
		gridPanels({ ...page, grid: before }).map((p) => {
			const c = p.cells[0];
			return [`${Math.floor(c / before.cols)},${c % before.cols}`, p];
		})
	);
	const fresh = singleCellPanels(next).map((p) => {
		const c = p.cells[0];
		const kept = old.get(`${Math.floor(c / next.cols)},${c % next.cols}`);
		return kept ? { ...kept, cells: [c] } : p;
	});
	page.panels = [...fresh, ...page.panels.filter((p) => p.kind === 'free')];
	return { ok: true };
}

/** The whole grid as one borderless panel — the p.58 full-page background. */
export function splash(page: Page): void {
	const panels = gridPanels(page);
	if (panels.length > 1)
		mergePanels(
			page,
			panels.map((p) => p.id)
		);
	gridPanels(page)[0].border = 'none';
}

export function createFreePanel(page: Page): FreePanel {
	const w = page.width * 0.45;
	const h = page.height * 0.22;
	const z = Math.max(0, ...page.panels.map((p) => (p.kind === 'free' ? p.z : 0))) + 1;
	return {
		id: newId(),
		kind: 'free',
		x: (page.width - w) / 2,
		y: (page.height - h) / 2,
		w,
		h,
		z,
		border: 'solid',
		fill: '#ffffff'
	};
}

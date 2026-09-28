import { describe, expect, it } from 'vitest';
import { createPage } from './factory';
import { checkPage } from './invariants';
import { createFreePanel, mergePanels, setGrid, splash, splitPanel } from './panels';
import type { GridPanel, Page } from './types';

const grid = (page: Page) => page.panels.filter((p): p is GridPanel => p.kind === 'grid');
const panelAtCell = (page: Page, cell: number) => grid(page).find((p) => p.cells.includes(cell))!;
const ids = (page: Page, cells: number[]) => cells.map((c) => panelAtCell(page, c).id);
const image = (assetId: string) => ({
	assetId,
	naturalWidth: 10,
	naturalHeight: 10,
	offsetX: 0,
	offsetY: 0,
	scale: 1
});

describe('mergePanels', () => {
	it('merges a 2×2 block into one panel that keeps the first id', () => {
		const page = createPage();
		const selected = ids(page, [0, 1, 4, 5]);
		expect(mergePanels(page, selected)).toEqual({ ok: true, mergedId: selected[0] });
		expect(page.panels).toHaveLength(9);
		const merged = panelAtCell(page, 0);
		expect(merged.id).toBe(selected[0]);
		expect(merged.cells).toEqual([0, 1, 4, 5]);
		expect(checkPage(page)).toEqual([]);
	});

	it('merges already-merged panels (L grows into a block)', () => {
		const page = createPage();
		expect(mergePanels(page, ids(page, [0, 1, 4])).ok).toBe(true);
		expect(mergePanels(page, ids(page, [0, 5])).ok).toBe(true);
		expect(panelAtCell(page, 5).cells).toHaveLength(4);
		expect(checkPage(page)).toEqual([]);
	});

	it('rejects a non-contiguous merge with a reason and leaves the page alone', () => {
		const page = createPage();
		expect(mergePanels(page, ids(page, [0, 5]))).toEqual({ ok: false, reason: 'not-contiguous' });
		expect(page.panels).toHaveLength(12);
	});

	it('rejects fewer than two panels', () => {
		const page = createPage();
		expect(mergePanels(page, ids(page, [0]))).toEqual({ ok: false, reason: 'need-two' });
	});

	it('keeps the image of the first selected panel that has one', () => {
		const page = createPage();
		panelAtCell(page, 1).image = image('a1');
		mergePanels(page, ids(page, [0, 1]));
		expect(panelAtCell(page, 0).image).toEqual(image('a1'));
	});
});

describe('splitPanel', () => {
	it('splits an N-cell panel into N single panels; the top-left keeps the id and image', () => {
		const page = createPage();
		mergePanels(page, ids(page, [2, 6, 7]));
		const merged = panelAtCell(page, 6);
		merged.image = image('x');
		splitPanel(page, merged.id);
		expect(page.panels).toHaveLength(12);
		expect(panelAtCell(page, 2).id).toBe(merged.id);
		expect(panelAtCell(page, 2).image?.assetId).toBe('x');
		expect(panelAtCell(page, 7).image).toBeUndefined();
		expect(checkPage(page)).toEqual([]);
	});
});

describe('setGrid', () => {
	it('regenerates the partition when every panel is a single cell', () => {
		const page = createPage();
		expect(setGrid(page, { rows: 4, cols: 3 })).toEqual({ ok: true });
		expect(page.grid.rows).toBe(4);
		expect(page.panels).toHaveLength(12);
		expect(checkPage(page)).toEqual([]);
	});

	it('keeps panels (and their images) for cells that survive a resize', () => {
		const page = createPage();
		const keep = panelAtCell(page, 0).id;
		setGrid(page, { rows: 2, cols: 2 });
		expect(panelAtCell(page, 0).id).toBe(keep);
	});

	it('is refused while merged panels exist', () => {
		const page = createPage();
		mergePanels(page, ids(page, [0, 1]));
		expect(setGrid(page, { rows: 2 })).toEqual({ ok: false, reason: 'has-merges' });
		expect(page.grid.rows).toBe(3);
	});

	it('allows gutter and margin changes regardless of merges', () => {
		const page = createPage();
		mergePanels(page, ids(page, [0, 1]));
		expect(setGrid(page, { gutter: 30 })).toEqual({ ok: true });
		expect(page.grid.gutter).toBe(30);
	});

	it('rejects impossible specs', () => {
		const page = createPage();
		expect(setGrid(page, { rows: 0 })).toEqual({ ok: false, reason: 'invalid' });
	});
});

describe('splash', () => {
	it('turns the whole grid into one borderless panel', () => {
		const page = createPage();
		splash(page);
		const panels = grid(page);
		expect(panels).toHaveLength(1);
		expect(panels[0].cells).toHaveLength(12);
		expect(panels[0].border).toBe('none');
	});

	it('keeps free panels', () => {
		const page = createPage();
		page.panels.push(createFreePanel(page));
		splash(page);
		expect(page.panels.filter((p) => p.kind === 'free')).toHaveLength(1);
	});
});

describe('createFreePanel', () => {
	it('centres a panel on the page above existing free panels', () => {
		const page = createPage();
		const a = createFreePanel(page);
		page.panels.push(a);
		const b = createFreePanel(page);
		expect(a.x + a.w / 2).toBeCloseTo(page.width / 2);
		expect(b.z).toBeGreaterThan(a.z);
	});
});

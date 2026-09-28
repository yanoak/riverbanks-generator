import { describe, expect, it } from 'vitest';
import { createPage } from '../factory';
import { checkPage } from '../invariants';
import type { GridPanel, Page } from '../types';
import { MergePanelsCommand, SetGridCommand, SplitPanelCommand } from './panels';

const grid = (page: Page) => page.panels.filter((p): p is GridPanel => p.kind === 'grid');
const panelAtCell = (page: Page, cell: number) => grid(page).find((p) => p.cells.includes(cell))!;
const ids = (page: Page, cells: number[]) => cells.map((c) => panelAtCell(page, c).id);

describe('MergePanelsCommand', () => {
	it('merges a 2×2 block into one panel that keeps the first id', () => {
		const page = createPage();
		const selected = ids(page, [0, 1, 4, 5]);
		const cmd = MergePanelsCommand.create(page, selected);
		expect(cmd.ok).toBe(true);
		if (!cmd.ok) return;
		cmd.command.execute();

		expect(page.panels).toHaveLength(9);
		const merged = panelAtCell(page, 0);
		expect(merged.id).toBe(selected[0]);
		expect([...merged.cells].sort((a, b) => a - b)).toEqual([0, 1, 4, 5]);
		expect(checkPage(page)).toEqual([]);
		expect(cmd.mergedId).toBe(selected[0]);
	});

	it('undo restores the exact prior panels and ids', () => {
		const page = createPage();
		const before = structuredClone(page.panels);
		const cmd = MergePanelsCommand.create(page, ids(page, [2, 6, 7]));
		if (!cmd.ok) throw new Error('expected ok');
		cmd.command.execute();
		cmd.command.undo();
		expect(page.panels).toEqual(before);
	});

	it('merges already-merged panels (L grows into a block)', () => {
		const page = createPage();
		const first = MergePanelsCommand.create(page, ids(page, [0, 1, 4]));
		if (!first.ok) throw new Error();
		first.command.execute();
		const second = MergePanelsCommand.create(page, ids(page, [0, 5]));
		expect(second.ok).toBe(true);
		if (second.ok) second.command.execute();
		expect(panelAtCell(page, 5).cells).toHaveLength(4);
		expect(checkPage(page)).toEqual([]);
	});

	it('rejects a non-contiguous merge with a reason and leaves the page alone', () => {
		const page = createPage();
		const cmd = MergePanelsCommand.create(page, ids(page, [0, 5]));
		expect(cmd).toEqual({ ok: false, reason: 'not-contiguous' });
		expect(page.panels).toHaveLength(12);
	});

	it('rejects fewer than two panels', () => {
		const page = createPage();
		expect(MergePanelsCommand.create(page, ids(page, [0]))).toEqual({
			ok: false,
			reason: 'need-two'
		});
	});

	it('keeps the image of the first selected panel that has one', () => {
		const page = createPage();
		const image = {
			assetId: 'a1',
			naturalWidth: 10,
			naturalHeight: 10,
			offsetX: 0,
			offsetY: 0,
			scale: 1
		};
		panelAtCell(page, 1).image = image;
		const cmd = MergePanelsCommand.create(page, ids(page, [0, 1]));
		if (!cmd.ok) throw new Error();
		cmd.command.execute();
		expect(panelAtCell(page, 0).image).toEqual(image);
	});
});

describe('SplitPanelCommand', () => {
	it('splits an N-cell panel into N single panels; the top-left keeps the id and image', () => {
		const page = createPage();
		const merge = MergePanelsCommand.create(page, ids(page, [2, 6, 7]));
		if (!merge.ok) throw new Error();
		merge.command.execute();
		const merged = panelAtCell(page, 6);
		merged.image = {
			assetId: 'x',
			naturalWidth: 1,
			naturalHeight: 1,
			offsetX: 0,
			offsetY: 0,
			scale: 1
		};

		const split = new SplitPanelCommand(page, merged.id);
		split.execute();
		expect(page.panels).toHaveLength(12);
		expect(panelAtCell(page, 2).id).toBe(merged.id);
		expect(panelAtCell(page, 2).image?.assetId).toBe('x');
		expect(panelAtCell(page, 7).image).toBeUndefined();
		expect(checkPage(page)).toEqual([]);

		split.undo();
		expect(page.panels).toHaveLength(10);
		expect(panelAtCell(page, 7).id).toBe(merged.id);
	});
});

describe('SetGridCommand', () => {
	it('regenerates the partition when every panel is a single cell', () => {
		const page = createPage();
		const cmd = SetGridCommand.create(page, { rows: 4, cols: 3 });
		expect(cmd.ok).toBe(true);
		if (!cmd.ok) return;
		cmd.command.execute();
		expect(page.grid.rows).toBe(4);
		expect(page.panels).toHaveLength(12);
		expect(checkPage(page)).toEqual([]);
		cmd.command.undo();
		expect(page.grid.cols).toBe(4);
	});

	it('keeps panels (and their images) for cells that survive a resize', () => {
		const page = createPage();
		const keep = panelAtCell(page, 0).id;
		const cmd = SetGridCommand.create(page, { rows: 2, cols: 2 });
		if (!cmd.ok) throw new Error();
		cmd.command.execute();
		expect(panelAtCell(page, 0).id).toBe(keep);
	});

	it('is refused while merged panels exist', () => {
		const page = createPage();
		const merge = MergePanelsCommand.create(page, ids(page, [0, 1]));
		if (merge.ok) merge.command.execute();
		expect(SetGridCommand.create(page, { rows: 2 })).toEqual({ ok: false, reason: 'has-merges' });
	});

	it('allows gutter and margin changes regardless of merges', () => {
		const page = createPage();
		const merge = MergePanelsCommand.create(page, ids(page, [0, 1]));
		if (merge.ok) merge.command.execute();
		const cmd = SetGridCommand.create(page, { gutter: 30 });
		expect(cmd.ok).toBe(true);
	});
});

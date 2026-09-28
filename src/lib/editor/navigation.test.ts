import { describe, expect, it } from 'vitest';
import { createPage } from '$lib/model/factory';
import { MergePanelsCommand } from '$lib/model/commands/panels';
import { gridPanels } from '$lib/model/invariants';
import type { Page } from '$lib/model/types';
import { neighbourPanel } from './navigation';

const at = (page: Page, cell: number) => gridPanels(page).find((p) => p.cells.includes(cell))!.id;

describe('neighbourPanel', () => {
	it('steps to the adjacent single cell in each direction', () => {
		const page = createPage(); // 3 × 4
		expect(neighbourPanel(page, at(page, 5), 'right')).toBe(at(page, 6));
		expect(neighbourPanel(page, at(page, 5), 'left')).toBe(at(page, 4));
		expect(neighbourPanel(page, at(page, 5), 'up')).toBe(at(page, 1));
		expect(neighbourPanel(page, at(page, 5), 'down')).toBe(at(page, 9));
	});

	it('returns null at the page edge', () => {
		const page = createPage();
		expect(neighbourPanel(page, at(page, 0), 'left')).toBeNull();
		expect(neighbourPanel(page, at(page, 3), 'up')).toBeNull();
	});

	it('leaves a merged panel from its outermost cells', () => {
		const page = createPage();
		const m = MergePanelsCommand.create(page, [at(page, 0), at(page, 1), at(page, 4), at(page, 5)]);
		if (!m.ok) throw new Error();
		m.command.execute();
		expect(neighbourPanel(page, m.mergedId, 'right')).toBe(at(page, 2));
		expect(neighbourPanel(page, m.mergedId, 'down')).toBe(at(page, 8));
		// Stepping back in from the right lands on the merged panel.
		expect(neighbourPanel(page, at(page, 2), 'left')).toBe(m.mergedId);
	});
});

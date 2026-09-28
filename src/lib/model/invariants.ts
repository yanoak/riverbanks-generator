import { canMerge } from '$lib/geometry/grid';
import type { GridPanel, Page } from './types';

/** Problems with a page's grid partition; empty when every cell has exactly one valid panel. */
export function checkPage(page: Page): string[] {
	const problems: string[] = [];
	const total = page.grid.rows * page.grid.cols;
	const owners = new Map<number, number>();
	for (const panel of page.panels) {
		if (panel.kind !== 'grid') continue;
		for (const cell of panel.cells) owners.set(cell, (owners.get(cell) ?? 0) + 1);
		const check = canMerge(panel.cells, page.grid);
		if (!check.ok) problems.push(`panel ${panel.id} is ${check.reason}`);
	}
	for (let cell = 0; cell < total; cell++) {
		const n = owners.get(cell) ?? 0;
		if (n === 0) problems.push(`cell ${cell} has no panel`);
		if (n > 1) problems.push(`cell ${cell} is claimed by ${n} panels`);
	}
	for (const cell of owners.keys()) {
		if (cell < 0 || cell >= total) problems.push(`cell ${cell} is outside the grid`);
	}
	return problems;
}

export const gridPanels = (page: Page): GridPanel[] =>
	page.panels.filter((p): p is GridPanel => p.kind === 'grid');

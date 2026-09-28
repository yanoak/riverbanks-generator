import { gridPanels } from '$lib/model/invariants';
import type { Page } from '$lib/model/types';

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * The grid panel reached by stepping out of `panelId` in a direction — from the panel's
 * top-most (for left/right) or left-most (for up/down) cell on that edge. Null at the edge.
 */
export function neighbourPanel(page: Page, panelId: string, dir: Direction): string | null {
	const { rows, cols } = page.grid;
	const panels = gridPanels(page);
	const panel = panels.find((p) => p.id === panelId);
	if (!panel) return null;
	const own = new Set(panel.cells);
	const step = { up: -cols, down: cols, left: -1, right: 1 }[dir];
	const candidates = [...panel.cells]
		.sort((a, b) => a - b)
		.filter((cell) => {
			const row = Math.floor(cell / cols);
			const col = cell % cols;
			if (dir === 'left' && col === 0) return false;
			if (dir === 'right' && col === cols - 1) return false;
			if (dir === 'up' && row === 0) return false;
			if (dir === 'down' && row === rows - 1) return false;
			return !own.has(cell + step);
		});
	if (!candidates.length) return null;
	const target = candidates[0] + step;
	return panels.find((p) => p.cells.includes(target))?.id ?? null;
}

import { DOC_VERSION, type Comic, type GridPanel, type GridSpec, type Page, type Size } from './types';

/** US comic trim, 6.625" × 10.25", at ~151 units per inch. */
export const PAGE_SIZE: Size = { width: 1000, height: 1545 };

export const DEFAULT_GRID: GridSpec = { rows: 3, cols: 4, gutter: 16, margin: 40 };

export const newId = (): string => crypto.randomUUID();

export function singleCellPanels(grid: GridSpec): GridPanel[] {
	return Array.from({ length: grid.rows * grid.cols }, (_, cell) => ({
		id: newId(),
		kind: 'grid',
		cells: [cell],
		border: 'solid',
		fill: '#ffffff'
	}));
}

export function createPage(grid: Partial<GridSpec> = {}): Page {
	const spec = { ...DEFAULT_GRID, ...grid };
	return { id: newId(), ...PAGE_SIZE, grid: spec, panels: singleCellPanels(spec), balloons: [] };
}

export function createComic(title = 'Untitled comic'): Comic {
	return { id: newId(), title, pages: [createPage()], docVersion: DOC_VERSION };
}

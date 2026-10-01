import {
	DOC_VERSION,
	type Comic,
	type GridPanel,
	type GridSpec,
	type Page,
	type Size
} from './types';

export type PageFormat = 'board' | 'comic';

/**
 * The page shapes a comic can be made in. A page stores its own size and grid, so a format is
 * only where a new comic starts; later pages copy the page they follow.
 *
 * - board: an A1 exhibition board, after Sam's "RIVERBANKS Paneling" slides (1684 × 2384 pt).
 *   A 1000 × 1000 square of comic sits between a 208-unit header and footer (350 pt on A1).
 * - comic: US comic trim, 6.625" × 10.25", at ~151 units per inch.
 */
export const PAGE_FORMATS: Record<PageFormat, { label: string; size: Size; grid: GridSpec }> = {
	board: {
		label: 'A1 board (594 × 841 mm)',
		size: { width: 1000, height: 1416 },
		grid: { rows: 4, cols: 4, gutter: 10, margin: 12, top: 208, bottom: 208 }
	},
	comic: {
		label: 'Comic page',
		size: { width: 1000, height: 1545 },
		grid: { rows: 3, cols: 4, gutter: 16, margin: 40 }
	}
};

/** What new comics are made of, in the app and over MCP. */
export const DEFAULT_FORMAT: PageFormat = 'board';

/** The comic trim; pages made without a size get it. */
export const PAGE_SIZE: Size = PAGE_FORMATS.comic.size;

export const DEFAULT_GRID: GridSpec = PAGE_FORMATS.comic.grid;

export const newId = (): string => crypto.randomUUID();

/** Which format a page was made in, or null if someone has since changed its shape. */
export function formatOf(page: Page): PageFormat | null {
	const entry = Object.entries(PAGE_FORMATS).find(
		([, f]) =>
			f.size.width === page.width &&
			f.size.height === page.height &&
			(f.grid.top ?? 0) === (page.grid.top ?? 0) &&
			(f.grid.bottom ?? 0) === (page.grid.bottom ?? 0)
	);
	return entry ? (entry[0] as PageFormat) : null;
}

export function singleCellPanels(grid: GridSpec): GridPanel[] {
	return Array.from({ length: grid.rows * grid.cols }, (_, cell) => ({
		id: newId(),
		kind: 'grid',
		cells: [cell],
		border: 'solid',
		fill: '#ffffff'
	}));
}

/** A page of single-cell panels. Pass a neighbour's grid and size to make one like it. */
export function createPage(grid: Partial<GridSpec> = {}, size: Size = PAGE_SIZE): Page {
	const spec = { ...DEFAULT_GRID, ...grid };
	return {
		id: newId(),
		width: size.width,
		height: size.height,
		grid: spec,
		panels: singleCellPanels(spec),
		balloons: []
	};
}

export function createComic(title = 'Untitled comic', format: PageFormat = 'comic'): Comic {
	const { grid, size } = PAGE_FORMATS[format];
	return { id: newId(), title, pages: [createPage(grid, size)], docVersion: DOC_VERSION };
}

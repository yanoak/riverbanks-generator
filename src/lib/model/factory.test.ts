import { describe, expect, it } from 'vitest';
import {
	createComic,
	createPage,
	DEFAULT_FORMAT,
	DEFAULT_GRID,
	formatOf,
	PAGE_SIZE
} from './factory';
import { DOC_VERSION } from './types';

describe('createPage', () => {
	it('defaults to a 3×4 grid of single-cell panels partitioning every cell', () => {
		const page = createPage();
		expect(page.grid).toEqual(DEFAULT_GRID);
		expect(page.grid.rows).toBe(3);
		expect(page.grid.cols).toBe(4);
		expect(page.width).toBe(PAGE_SIZE.width);
		expect(page.height).toBe(PAGE_SIZE.height);

		const cells = page.panels.flatMap((p) => (p.kind === 'grid' ? p.cells : []));
		expect(cells.sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
		expect(page.panels.every((p) => p.kind === 'grid' && p.cells.length === 1)).toBe(true);
		expect(page.balloons).toEqual([]);
	});

	it('gives every panel a unique id', () => {
		const page = createPage();
		expect(new Set(page.panels.map((p) => p.id)).size).toBe(page.panels.length);
	});

	it('honours a custom grid', () => {
		const page = createPage({ rows: 2, cols: 2 });
		expect(page.panels).toHaveLength(4);
		expect(page.grid.gutter).toBe(DEFAULT_GRID.gutter);
	});
});

describe('createComic', () => {
	it('starts with one page at the current doc version', () => {
		const comic = createComic('Riverbanks');
		expect(comic.title).toBe('Riverbanks');
		expect(comic.pages).toHaveLength(1);
		expect(comic.docVersion).toBe(DOC_VERSION);
	});
});

describe('page formats', () => {
	it('makes an A1 board: a 5:4 comic, edge to edge, between a header and a footer', () => {
		const page = createComic('Taming Currents', 'board').pages[0];
		expect(page.width / page.height).toBeCloseTo(594 / 841, 3);
		expect(page.grid).toMatchObject({ rows: 4, cols: 4, margin: 0, top: 83, bottom: 83 });
		expect(page.height - page.grid.top! - page.grid.bottom!).toBe((page.width * 5) / 4);
		expect(page.panels).toHaveLength(16);
		expect(formatOf(page)).toBe('board');
	});

	it('still calls a board made with the old 208-unit bands a board', () => {
		const page = createComic('Old board', 'board').pages[0];
		page.grid = { ...page.grid, margin: 12, top: 208, bottom: 208 };
		expect(formatOf(page)).toBe('board');
	});

	it('still makes the portrait comic page', () => {
		const page = createComic('Old', 'comic').pages[0];
		expect(page).toMatchObject({ width: 1000, height: 1545 });
		expect(page.grid.top).toBeUndefined();
		expect(formatOf(page)).toBe('comic');
	});

	it('makes new comics as boards', () => {
		expect(DEFAULT_FORMAT).toBe('board');
	});

	it('copies a neighbour’s size and grid', () => {
		const board = createComic('t', 'board').pages[0];
		const next = createPage(board.grid, board);
		expect(next.width).toBe(board.width);
		expect(next.height).toBe(board.height);
		expect(next.grid).toEqual(board.grid);
	});
});

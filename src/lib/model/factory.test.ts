import { describe, expect, it } from 'vitest';
import { createComic, createPage, DEFAULT_GRID, PAGE_SIZE } from './factory';
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

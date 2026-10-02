import { describe, expect, it } from 'vitest';
import {
	canMerge,
	insetOrthogonal,
	pullInside,
	cellAt,
	cellRect,
	derivePanels,
	hasHoles,
	isContiguous,
	panelOutline,
	polygonBBox
} from './grid';
import type { GridSpec } from '$lib/model/types';

// 4 cols × 3 rows on a 1020 × 780 page: cell 220 wide, 220 tall with margin 40 and gutter 20.
const grid: GridSpec = { rows: 3, cols: 4, gutter: 20, margin: 40 };
const size = { width: 1020, height: 780 };

// Cell indices:
//  0  1  2  3
//  4  5  6  7
//  8  9 10 11

describe('cellRect', () => {
	it('places the first cell at the margin', () => {
		expect(cellRect(grid, size, 0)).toEqual({ x: 40, y: 40, w: 220, h: 220 });
	});

	it('steps by cell + gutter', () => {
		expect(cellRect(grid, size, 5)).toEqual({ x: 280, y: 280, w: 220, h: 220 });
	});

	it('ends the last column and row at size - margin', () => {
		const r = cellRect(grid, size, 11);
		expect(r.x + r.w).toBe(size.width - grid.margin);
		expect(r.y + r.h).toBe(size.height - grid.margin);
	});
});

describe('isContiguous', () => {
	it.each([
		['single cell', [0], true],
		['2×2 block', [0, 1, 4, 5], true],
		['L-shape', [2, 6, 7], true],
		['diagonal-only pair', [0, 5], false],
		['empty', [], false],
		['wraps across a row end (3 and 4 are not neighbours)', [3, 4], false]
	])('%s', (_name, cells, expected) => {
		expect(isContiguous(cells as number[], grid)).toBe(expected);
	});
});

describe('hasHoles', () => {
	it('is false for a U-shape open to the edge', () => {
		// 0 . 2 / 4 5 6
		expect(hasHoles([0, 2, 4, 5, 6], grid)).toBe(false);
	});

	it('is true for a ring around a centre cell', () => {
		const g: GridSpec = { rows: 3, cols: 3, gutter: 0, margin: 0 };
		expect(hasHoles([0, 1, 2, 3, 5, 6, 7, 8], g)).toBe(true);
	});

	it('treats a diagonal pinch as a hole (enclosed region only touches outside at a corner)', () => {
		// 3×3: all but cells 4 and 8 → cell 8 is open to the page edge, 4 is enclosed.
		const g: GridSpec = { rows: 3, cols: 3, gutter: 0, margin: 0 };
		expect(hasHoles([0, 1, 2, 3, 5, 6, 7], g)).toBe(true);
	});
});

describe('canMerge', () => {
	it('accepts contiguous hole-free sets and explains rejections', () => {
		expect(canMerge([0, 1, 4, 5], grid)).toEqual({ ok: true });
		expect(canMerge([0, 5], grid)).toEqual({ ok: false, reason: 'not-contiguous' });
		const g: GridSpec = { rows: 3, cols: 3, gutter: 0, margin: 0 };
		expect(canMerge([0, 1, 2, 3, 5, 6, 7, 8], g)).toEqual({ ok: false, reason: 'has-hole' });
	});
});

describe('panelOutline', () => {
	it('is the cell rect for a single cell, clockwise from top-left', () => {
		expect(panelOutline([5], grid, size)).toEqual([
			{ x: 280, y: 280 },
			{ x: 500, y: 280 },
			{ x: 500, y: 500 },
			{ x: 280, y: 500 }
		]);
	});

	it('spans the gutter for a 1×2 merge', () => {
		expect(panelOutline([0, 1], grid, size)).toEqual([
			{ x: 40, y: 40 },
			{ x: 500, y: 40 },
			{ x: 500, y: 260 },
			{ x: 40, y: 260 }
		]);
	});

	it('has 4 vertices for a 2×2 block — no interior vertices', () => {
		expect(panelOutline([0, 1, 4, 5], grid, size)).toHaveLength(4);
	});

	it('traces an L of three cells as 6 clockwise vertices', () => {
		// cells 2, 6, 7:  [2] .  /  [6][7]
		expect(panelOutline([2, 6, 7], grid, size)).toEqual([
			{ x: 520, y: 40 },
			{ x: 740, y: 40 },
			{ x: 740, y: 280 },
			{ x: 980, y: 280 },
			{ x: 980, y: 500 },
			{ x: 520, y: 500 }
		]);
	});

	it('traces a U-shape as 8 vertices', () => {
		expect(panelOutline([0, 2, 4, 5, 6], grid, size)).toHaveLength(8);
	});

	it('is independent of cell order', () => {
		expect(panelOutline([7, 2, 6], grid, size)).toEqual(panelOutline([2, 6, 7], grid, size));
	});
});

describe('polygonBBox', () => {
	it('bounds the points', () => {
		expect(polygonBBox(panelOutline([2, 6, 7], grid, size))).toEqual({
			x: 520,
			y: 40,
			w: 460,
			h: 460
		});
	});
});

describe('derivePanels', () => {
	// Owner ids per cell, row-major, for the 4×3 test grid.
	const own = (ids: (string | undefined)[]) => (cell: number) => ids[cell];
	const has = (known: string[]) => (id: string) => known.includes(id);
	const all = 'a b c d e f g h i j k l'.split(' ');

	it('a normal partition comes back unchanged, ordered by first cell', () => {
		const ids = ['a', 'a', 'c', 'd', 'a', 'a', 'g', 'h', 'i', 'j', 'k', 'l'];
		const out = derivePanels(grid, own(ids), has(all));
		expect(out.map((p) => [p.id, p.cells])).toEqual([
			['a', [0, 1, 4, 5]],
			['c', [2]],
			['d', [3]],
			['g', [6]],
			['h', [7]],
			['i', [8]],
			['j', [9]],
			['k', [10]],
			['l', [11]]
		]);
		expect(out.every((p) => p.source === p.id && !p.derived)).toBe(true);
	});

	it('a disconnected owner becomes one panel per component; extras get derived ids', () => {
		const ids = ['a', 'b', 'a', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
		const out = derivePanels(grid, own(ids), has(all));
		const a = out.filter((p) => p.source === 'a');
		expect(a.map((p) => [p.id, p.cells, p.derived])).toEqual([
			['a', [0], false],
			['a~0,2', [2], true]
		]);
	});

	it('a holed ring is split into row runs, all hole-free', () => {
		// a owns everything except cell 5, which b owns: a ring around b.
		const ids = ['a', 'a', 'a', 'd', 'a', 'b', 'a', 'h', 'a', 'a', 'a', 'l'];
		const out = derivePanels(grid, own(ids), has(['a', 'b', 'd', 'h', 'l']));
		const a = out.filter((p) => p.source === 'a');
		expect(a.map((p) => [p.id, p.cells])).toEqual([
			['a', [0, 1, 2]],
			['a~1,0', [4]],
			['a~1,2', [6]],
			['a~2,0', [8, 9, 10]]
		]);
		for (const p of out) expect(canMerge(p.cells, grid)).toEqual({ ok: true });
	});

	it('a cell with no owner, or an owner with no panel, becomes a default single panel', () => {
		const ids = ['a', undefined, 'gone', ...all.slice(3)];
		const out = derivePanels(grid, own(ids), has(all));
		expect(out.find((p) => p.cells[0] === 1)).toEqual({
			id: '~0,1',
			cells: [1],
			source: null,
			derived: true
		});
		expect(out.find((p) => p.cells[0] === 2)?.source).toBeNull();
	});

	it('every cell is covered exactly once', () => {
		const ids = ['a', 'b', 'a', 'b', 'b', 'a', 'b', 'a', undefined, 'a', 'x', 'a'];
		const out = derivePanels(grid, own(ids), has(['a', 'b']));
		const cells = out.flatMap((p) => p.cells).sort((x, y) => x - y);
		expect(cells).toEqual([...Array(12).keys()]);
		for (const p of out) expect(canMerge(p.cells, grid)).toEqual({ ok: true });
	});
});

describe('header and footer bands (grid top/bottom)', () => {
	// The A1 board: a 1000 × 1000 square between two 208-unit bands, margin 20, gutter 10.
	const board: GridSpec = { rows: 4, cols: 4, gutter: 10, margin: 20, top: 208, bottom: 208 };
	const page = { width: 1000, height: 1416 };

	it('starts the first row below the header band and the margin', () => {
		expect(cellRect(board, page, 0)).toEqual({ x: 20, y: 228, w: 232.5, h: 232.5 });
	});

	it('ends the last row above the footer band and the margin', () => {
		const r = cellRect(board, page, 15);
		expect(r.y + r.h).toBe(1416 - 208 - 20);
	});

	it('finds no cell in the bands', () => {
		expect(cellAt(board, page, { x: 100, y: 100 })).toBeNull();
		expect(cellAt(board, page, { x: 100, y: 1300 })).toBeNull();
		expect(cellAt(board, page, { x: 100, y: 240 })).toBe(0);
	});

	it('traces a full-grid panel around exactly the square inside the bands', () => {
		const all = [...Array(16).keys()];
		expect(polygonBBox(panelOutline(all, board, page))).toEqual({ x: 20, y: 228, w: 960, h: 960 });
	});

	it('runs the current board’s grid edge to edge between its 83-unit bands', () => {
		const all = [...Array(16).keys()];
		const v2: GridSpec = { rows: 4, cols: 4, gutter: 10, margin: 0, top: 83, bottom: 83 };
		expect(polygonBBox(panelOutline(all, v2, page))).toEqual({ x: 0, y: 83, w: 1000, h: 1250 });
	});

	it('treats missing bands as zero', () => {
		const plain: GridSpec = { rows: 4, cols: 4, gutter: 10, margin: 20 };
		expect(cellRect(plain, page, 0).y).toBe(20);
	});
});

describe('insetOrthogonal', () => {
	it('moves every edge of a clockwise outline inwards', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 }
		];
		expect(insetOrthogonal(square, 2)).toEqual([
			{ x: 2, y: 2 },
			{ x: 8, y: 2 },
			{ x: 8, y: 8 },
			{ x: 2, y: 8 }
		]);
	});

	it('handles an L-shaped panel’s inner corner', () => {
		const l = panelOutline([0, 1, 5], grid, size);
		const inset = insetOrthogonal(l, 2);
		const box = polygonBBox(l);
		expect(polygonBBox(inset)).toEqual({ x: box.x + 2, y: box.y + 2, w: box.w - 4, h: box.h - 4 });
	});
});

describe('pullInside', () => {
	const square = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 }
	];

	it('leaves a point that is already inside', () => {
		expect(pullInside({ x: 10, y: 10 }, { x: 50, y: 50 }, square)).toEqual({ x: 10, y: 10 });
	});

	it('slides an outside point along the line until it is just inside', () => {
		const p = pullInside({ x: -40, y: 50 }, { x: 60, y: 50 }, square);
		expect(p.y).toBe(50);
		expect(p.x).toBeGreaterThan(0);
		expect(p.x).toBeLessThan(1);
	});
});

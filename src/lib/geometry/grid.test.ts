import { describe, expect, it } from 'vitest';
import { canMerge, cellRect, hasHoles, isContiguous, panelOutline, polygonBBox } from './grid';
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

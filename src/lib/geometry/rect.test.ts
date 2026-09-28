import { describe, expect, it } from 'vitest';
import { moveRect, resizeRect } from './rect';

const r = { x: 100, y: 100, w: 200, h: 100 };

describe('resizeRect', () => {
	it('east handle changes width only', () => {
		expect(resizeRect(r, 'e', { dx: 50, dy: 30 })).toEqual({ x: 100, y: 100, w: 250, h: 100 });
	});

	it('north-west handle moves the origin and shrinks', () => {
		expect(resizeRect(r, 'nw', { dx: 20, dy: 10 })).toEqual({ x: 120, y: 110, w: 180, h: 90 });
	});

	it('clamps to the minimum size without moving the opposite edge', () => {
		// Dragging the west edge far right: the east edge stays at 300.
		expect(resizeRect(r, 'w', { dx: 500, dy: 0 }, 20)).toEqual({ x: 280, y: 100, w: 20, h: 100 });
		expect(resizeRect(r, 's', { dx: 0, dy: -500 }, 20)).toEqual({ x: 100, y: 100, w: 200, h: 20 });
	});
});

describe('moveRect', () => {
	it('translates', () => {
		expect(moveRect(r, { dx: -10, dy: 5 })).toEqual({ x: 90, y: 105, w: 200, h: 100 });
	});
});

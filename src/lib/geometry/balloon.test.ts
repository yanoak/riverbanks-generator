import { describe, expect, it } from 'vitest';
import { balloonShape, textInset, tailBase, thoughtTrail } from './balloon';

const w = 200;
const h = 100;
const onEllipse = (p: { x: number; y: number }) =>
	((p.x - w / 2) / (w / 2)) ** 2 + ((p.y - h / 2) / (h / 2)) ** 2;

describe('tailBase', () => {
	it('puts both base points on the ellipse boundary', () => {
		const { left, right } = tailBase(w, h, { x: 150, y: 220 });
		expect(onEllipse(left)).toBeCloseTo(1, 5);
		expect(onEllipse(right)).toBeCloseTo(1, 5);
	});

	it('faces the tail point', () => {
		// Tail straight below: the base midpoint is on the bottom half, centred.
		const { left, right } = tailBase(w, h, { x: 100, y: 300 });
		const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
		expect(mid.y).toBeGreaterThan(h / 2);
		expect(mid.x).toBeCloseTo(100, 5);
		// Tail to the left: the base is on the left half.
		const side = tailBase(w, h, { x: -100, y: 50 });
		expect((side.left.x + side.right.x) / 2).toBeLessThan(w / 2);
	});
});

describe('balloonShape', () => {
	it('draws a speech balloon with a tail as ellipse + tail paths', () => {
		const shape = balloonShape('speech', w, h, { x: 150, y: 220 });
		expect(shape.paths).toHaveLength(2);
		expect(shape.paths[1]).toContain('150 220');
	});

	it('omits the tail when there is none', () => {
		expect(balloonShape('speech', w, h).paths).toHaveLength(1);
	});

	it('dashes whispers', () => {
		expect(balloonShape('whisper', w, h).dashed).toBe(true);
		expect(balloonShape('speech', w, h).dashed).toBe(false);
	});

	it('has no shape for sfx', () => {
		expect(balloonShape('sfx', w, h).paths).toEqual([]);
	});

	it('closes every path', () => {
		for (const type of ['speech', 'thought', 'shout', 'caption', 'whisper'] as const) {
			for (const p of balloonShape(type, w, h, { x: 0, y: 200 }).paths) {
				expect(p.trim().endsWith('Z')).toBe(true);
			}
		}
	});
});

describe('thoughtTrail', () => {
	it('shrinks circles from the balloon towards the tail point', () => {
		const trail = thoughtTrail(w, h, { x: 100, y: 300 });
		expect(trail.length).toBeGreaterThanOrEqual(2);
		for (let i = 1; i < trail.length; i++) {
			expect(trail[i].r).toBeLessThan(trail[i - 1].r);
			expect(trail[i].cy).toBeGreaterThan(trail[i - 1].cy);
		}
	});
});

describe('textInset', () => {
	it('keeps text inside the ellipse for round balloons and near the edge for captions', () => {
		expect(textInset('speech')).toBeGreaterThan(textInset('caption'));
	});
});

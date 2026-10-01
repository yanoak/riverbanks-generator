import { describe, expect, it } from 'vitest';
import {
	balloonShape,
	connectorEnds,
	neckShape,
	outlinePoint,
	roundedPath,
	textInset,
	tailBase,
	thoughtTrail
} from './balloon';

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

describe('roundness', () => {
	it('is exactly today’s ellipse at 1 (the speech default), and a box at 0', () => {
		expect(balloonShape('speech', w, h, undefined, { roundness: 1 })).toEqual(
			balloonShape('speech', w, h)
		);
		expect(roundedPath(w, h, 0)).toBe('M 0 0 H 200 V 100 H 0 Z');
		expect(balloonShape('caption', w, h)).toEqual(
			balloonShape('caption', w, h, undefined, { roundness: 0 })
		);
	});

	it('rounds the corners with elliptical arcs in between', () => {
		const d = roundedPath(w, h, 0.5);
		expect(d).toMatch(/^M 50 0 H 150 A 50 25 0 0 1 200 25/);
		expect(d.match(/ A /g)).toHaveLength(4);
	});

	it('gives captions and speech the same control', () => {
		expect(balloonShape('caption', w, h, undefined, { roundness: 0.3 }).paths[0]).toBe(
			roundedPath(w, h, 0.3)
		);
	});
});

describe('outlinePoint', () => {
	it('matches the ellipse at roundness 1', () => {
		for (const a of [0, 0.7, 2, 4]) {
			expect(onEllipse(outlinePoint(w, h, 1, a))).toBeCloseTo(1, 6);
		}
	});

	it('meets a box’s edges', () => {
		expect(outlinePoint(w, h, 0, 0)).toEqual({ x: 200, y: 50 });
		const down = outlinePoint(w, h, 0, Math.PI / 2);
		expect(down.x).toBeCloseTo(100, 6);
		expect(down.y).toBeCloseTo(100, 6);
		const corner = outlinePoint(w, h, 0, Math.PI / 4);
		expect(corner.x).toBeCloseTo(200, 6);
		expect(corner.y).toBeCloseTo(100, 6);
	});

	it('cuts across a rounded corner', () => {
		const p = outlinePoint(w, h, 0.5, Math.PI / 4);
		expect(p.x).toBeLessThan(200);
		expect(p.x).toBeGreaterThan(100 + 100 * Math.SQRT1_2);
	});

	it('attaches a box’s tail on the box', () => {
		const { left, right } = tailBase(w, h, { x: 100, y: 300 }, 0.22, 0);
		expect(left.y).toBeCloseTo(100, 6);
		expect(right.y).toBeCloseTo(100, 6);
	});
});

describe('textInset by roundness', () => {
	it('is 0.15 for an ellipse, 0.06 for a box, and grows in between', () => {
		expect(textInset('speech')).toBe(0.15);
		expect(textInset('speech', 0)).toBe(0.06);
		expect(textInset('caption')).toBe(0.06);
		const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => textInset('speech', r));
		expect([...steps].sort((a, b) => a - b)).toEqual(steps);
	});
});

describe('bumps and spikes', () => {
	const arcs = (d: string) => d.match(/ A /g)?.length ?? 0;
	const vertices = (d: string) => d.split(/ L /).length;

	it('keeps today’s shapes when nothing is set', () => {
		expect(balloonShape('shout', w, h, undefined, {})).toEqual(balloonShape('shout', w, h));
		expect(vertices(balloonShape('shout', w, h).paths[0])).toBe(36);
	});

	it('sets the bump count of a thought balloon', () => {
		expect(arcs(balloonShape('thought', w, h, undefined, { points: 7 }).paths[0])).toBe(7);
		expect(arcs(balloonShape('thought', w, h, undefined, { points: 30 }).paths[0])).toBe(30);
	});

	it('sets the spike count and depth of a shout', () => {
		expect(vertices(balloonShape('shout', w, h, undefined, { points: 9 }).paths[0])).toBe(18);
		const deep = balloonShape('shout', w, h, undefined, { points: 4 * 2, depth: 1 }).paths[0];
		const shallow = balloonShape('shout', w, h, undefined, { points: 8, depth: 0 }).paths[0];
		// The second vertex is the first inner point, straight below-right of the centre.
		const inner = (d: string) => Number(d.split(' L ')[1].split(' ')[0]);
		expect(inner(deep)).toBeLessThan(inner(shallow));
	});

	it('clamps silly counts', () => {
		expect(arcs(balloonShape('thought', w, h, undefined, { points: 1 }).paths[0])).toBe(5);
		expect(vertices(balloonShape('shout', w, h, undefined, { points: 500 }).paths[0])).toBe(96);
	});
});

describe('connectors', () => {
	const a = { x: 0, y: 0, w: 200, h: 100, type: 'speech' as const };
	const b = { x: 300, y: 200, w: 200, h: 100, type: 'speech' as const };

	it('runs a line from outline to outline, along the line between the centres', () => {
		const { from, to } = connectorEnds(a, b);
		const local = (p: { x: number; y: number }, o: typeof a) => ({ x: p.x - o.x, y: p.y - o.y });
		expect(onEllipse(local(from, a))).toBeCloseTo(1, 6);
		expect(onEllipse(local(to, b))).toBeCloseTo(1, 6);
		expect(from.x).toBeGreaterThan(100);
		expect(to.x).toBeLessThan(400);
	});

	it('ends on a box’s edge too', () => {
		const box = { ...b, roundness: 0, x: 0, y: 200 };
		const { to } = connectorEnds(a, box);
		expect(to.y).toBeCloseTo(200, 6);
	});

	it('draws a neck as a closed band and its fill reaching into both balloons', () => {
		const neck = neckShape(a, b);
		expect(neck.outline).toMatch(/Z$/);
		expect(neck.fill).toMatch(/Z$/);
		expect(neck.width).toBeCloseTo(22, 6); // 22% of the smaller height
	});
});

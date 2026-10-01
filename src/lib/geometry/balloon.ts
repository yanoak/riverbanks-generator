// Balloon outlines as SVG paths in balloon-local coordinates (0,0 = top-left of the box).
// The tail point is also balloon-local, so a tail moves with its balloon.

import type { BalloonType, Point, Rect } from '$lib/model/types';

export interface BalloonShape {
	/** Filled and stroked; drawn stroke-first then fill-on-top so overlaps read as one outline. */
	paths: string[];
	/** Thought-balloon trailing bubbles. */
	circles: { cx: number; cy: number; r: number }[];
	dashed: boolean;
}

/** A balloon's adjustable shape (see Balloon.roundness, .points, .depth); absent is the default. */
export interface ShapeOptions {
	roundness?: number;
	points?: number;
	depth?: number;
}

/** The outline's stroke width, in page units. */
export const BALLOON_STROKE = 7;

const f = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Bump and spike counts outside this range draw badly. */
export const POINTS_RANGE = [5, 48] as const;
const DEFAULT_SPIKES = 18;
const DEFAULT_DEPTH = 0.55;

/** How round a balloon of this type is when it says nothing: speech is an ellipse, a caption a box. */
export function roundnessOf(type: BalloonType, roundness?: number): number {
	return clamp(roundness ?? (type === 'caption' ? 0 : 1), 0, 1);
}

function ellipsePoint(w: number, h: number, angle: number): Point {
	return { x: w / 2 + (w / 2) * Math.cos(angle), y: h / 2 + (h / 2) * Math.sin(angle) };
}

function ellipsePath(w: number, h: number): string {
	const rx = w / 2;
	const ry = h / 2;
	return `M 0 ${f(ry)} A ${f(rx)} ${f(ry)} 0 1 1 ${f(w)} ${f(ry)} A ${f(rx)} ${f(ry)} 0 1 1 0 ${f(ry)} Z`;
}

/**
 * A rectangle whose corners are quarter-ellipses of radii r·w/2 and r·h/2: a box at r = 0,
 * today's ellipse at r = 1 (drawn by ellipsePath, so old balloons are unchanged).
 */
export function roundedPath(w: number, h: number, r: number): string {
	if (r <= 0) return `M 0 0 H ${f(w)} V ${f(h)} H 0 Z`;
	if (r >= 1) return ellipsePath(w, h);
	const rx = f((r * w) / 2);
	const ry = f((r * h) / 2);
	const arc = (x: number, y: number) => `A ${rx} ${ry} 0 0 1 ${f(x)} ${f(y)}`;
	return [
		`M ${rx} 0 H ${f(w - rx)}`,
		arc(w, ry),
		`V ${f(h - ry)}`,
		arc(w - rx, h),
		`H ${rx}`,
		arc(0, h - ry),
		`V ${ry}`,
		arc(rx, 0),
		'Z'
	].join(' ');
}

/**
 * Where the outline of roundness `r` meets the ray from the centre at parametric angle `angle`.
 * In coordinates scaled to the half-width and half-height the shape is a square with circular
 * corners of radius r, so this is a ray-square hit, refined on a corner circle.
 */
export function outlinePoint(w: number, h: number, r: number, angle: number): Point {
	if (r >= 1) return ellipsePoint(w, h, angle);
	const a = Math.cos(angle);
	const b = Math.sin(angle);
	const A = Math.abs(a);
	const B = Math.abs(b);
	let t = Math.min(A > 1e-12 ? 1 / A : Infinity, B > 1e-12 ? 1 / B : Infinity);
	const c = 1 - r;
	if (r > 0 && t * A > c && t * B > c) {
		const k = c * (A + B);
		t = k + Math.sqrt(k * k - (2 * c * c - r * r));
	}
	return { x: w / 2 + (w / 2) * t * a, y: h / 2 + (h / 2) * t * b };
}

/** Angle (in the ellipse's parametric space) facing a point. */
function facing(w: number, h: number, p: Point): number {
	return Math.atan2((p.y - h / 2) / (h / 2), (p.x - w / 2) / (w / 2));
}

/** Where a speech tail meets the ellipse: two boundary points either side of the facing angle. */
export function tailBase(w: number, h: number, tail: Point, spread = 0.22, r = 1) {
	const a = facing(w, h, tail);
	return {
		left: outlinePoint(w, h, r, a - spread),
		right: outlinePoint(w, h, r, a + spread),
		angle: a
	};
}

function tailPath(w: number, h: number, tail: Point, r: number): string {
	const { left, right } = tailBase(w, h, tail, 0.22, r);
	// Slight curve: control points pulled towards the balloon centre line.
	const c = { x: w / 2, y: h / 2 };
	const ctrl = (p: Point) => ({ x: (p.x * 2 + tail.x + c.x) / 4, y: (p.y * 2 + tail.y + c.y) / 4 });
	const cl = ctrl(left);
	const cr = ctrl(right);
	return `M ${f(left.x)} ${f(left.y)} Q ${f(cl.x)} ${f(cl.y)} ${f(tail.x)} ${f(tail.y)} Q ${f(cr.x)} ${f(cr.y)} ${f(right.x)} ${f(right.y)} Z`;
}

/** A thought balloon's bumps, or a shout's spikes, when the balloon sets none of its own. */
export function pointsOf(type: BalloonType, w: number, h: number, points?: number): number {
	if (points !== undefined) return Math.round(clamp(points, ...POINTS_RANGE));
	return type === 'shout' ? DEFAULT_SPIKES : Math.max(8, Math.round((w + h) / 28));
}

function cloudPath(w: number, h: number, points?: number): string {
	const bumps = pointsOf('thought', w, h, points);
	const pts = Array.from({ length: bumps }, (_, i) =>
		ellipsePoint(w * 0.92, h * 0.88, (i / bumps) * Math.PI * 2)
	).map((p) => ({ x: p.x + w * 0.04, y: p.y + h * 0.06 }));
	const r = (Math.PI * (w + h)) / 2 / bumps / 1.6;
	let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
	for (let i = 1; i <= bumps; i++) {
		const p = pts[i % bumps];
		d += ` A ${f(r)} ${f(r)} 0 0 1 ${f(p.x)} ${f(p.y)}`;
	}
	return d + ' Z';
}

function spikyPath(w: number, h: number, tail?: Point, points?: number, depth?: number): string {
	const spikes = pointsOf('shout', w, h, points);
	const inner = 1.08 - 0.4 * clamp(depth ?? DEFAULT_DEPTH, 0, 1);
	const tailAngle = tail ? facing(w, h, tail) : null;
	const pts: Point[] = [];
	for (let i = 0; i < spikes * 2; i++) {
		const a = (i / (spikes * 2)) * Math.PI * 2;
		const outer = i % 2 === 0;
		const k = outer ? 1.08 : inner;
		pts.push({ x: w / 2 + (w / 2) * k * Math.cos(a), y: h / 2 + (h / 2) * k * Math.sin(a) });
	}
	if (tail && tailAngle !== null) {
		// Replace the outer spike nearest the tail with the tail point itself.
		const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
		let best = 0;
		for (let i = 0; i < pts.length; i += 2) {
			const a = (i / pts.length) * Math.PI * 2;
			const d = Math.abs(norm(a - tailAngle + Math.PI) - Math.PI);
			const bd = Math.abs(norm((best / pts.length) * Math.PI * 2 - tailAngle + Math.PI) - Math.PI);
			if (d < bd) best = i;
		}
		pts[best] = tail;
	}
	return `M ${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ')} Z`;
}

/** Circles stepping from the balloon edge to the tail point, shrinking. */
export function thoughtTrail(w: number, h: number, tail: Point) {
	const start = ellipsePoint(w, h, facing(w, h, tail));
	const n = 3;
	const base = Math.min(w, h) * 0.09;
	return Array.from({ length: n }, (_, i) => {
		const t = (i + 1) / (n + 0.4);
		return {
			cx: f(start.x + (tail.x - start.x) * t),
			cy: f(start.y + (tail.y - start.y) * t),
			r: f(base * (1 - i * 0.3))
		};
	});
}

export function balloonShape(
	type: BalloonType,
	w: number,
	h: number,
	tail?: Point,
	opts: ShapeOptions = {}
): BalloonShape {
	const none: BalloonShape = { paths: [], circles: [], dashed: false };
	switch (type) {
		case 'sfx':
			return none;
		case 'caption':
			return { ...none, paths: [roundedPath(w, h, roundnessOf(type, opts.roundness))] };
		case 'thought':
			return {
				...none,
				paths: [cloudPath(w, h, opts.points)],
				circles: tail ? thoughtTrail(w, h, tail) : []
			};
		case 'shout':
			return { ...none, paths: [spikyPath(w, h, tail, opts.points, opts.depth)] };
		case 'speech':
		case 'whisper': {
			const r = roundnessOf(type, opts.roundness);
			return {
				paths: [roundedPath(w, h, r), ...(tail ? [tailPath(w, h, tail, r)] : [])],
				circles: [],
				dashed: type === 'whisper'
			};
		}
	}
}

/** Fraction of width/height to pad text so it sits inside the shape. */
export function textInset(type: BalloonType, roundness?: number): number {
	if (type === 'sfx') return 0.06;
	if (type === 'shout') return 0.2;
	if (type === 'thought') return 0.15;
	// A rounded corner of radius r·w/2 needs ~0.146·r of the width clear; the ellipse ~14.6%.
	const r = roundnessOf(type, roundness);
	return r >= 1 ? 0.15 : Math.max(0.06, 0.15 * r);
}

// --- connectors between balloons ------------------------------------------------------------

/** What a connector needs to know about a balloon. */
export type Connectable = Rect & { type: BalloonType; roundness?: number };

const outlineRoundness = (b: Connectable) =>
	b.type === 'speech' || b.type === 'whisper' || b.type === 'caption'
		? roundnessOf(b.type, b.roundness)
		: 1;

/** Where each balloon's outline faces the other: the line between their centres, cut by both. */
export function connectorEnds(a: Connectable, b: Connectable): { from: Point; to: Point } {
	const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
	const end = (s: Connectable, toward: Point) => {
		const p = outlinePoint(
			s.w,
			s.h,
			outlineRoundness(s),
			facing(s.w, s.h, { x: toward.x - s.x, y: toward.y - s.y })
		);
		return { x: s.x + p.x, y: s.y + p.y };
	};
	return { from: end(a, centre(b)), to: end(b, centre(a)) };
}

/**
 * A neck joining two balloons into one outline, drawn in two layers: `outline` (stroked and
 * filled, beneath both balloons; it starts deep inside each, so only the part between them
 * shows) and `fill` (fill only, above both balloons; slightly narrower, it paints over each
 * balloon's own outline across the neck's mouth so the joint reads as one shape).
 */
export function neckShape(
	a: Connectable,
	b: Connectable,
	stroke = BALLOON_STROKE,
	ends = connectorEnds(a, b)
) {
	const { from, to } = ends;
	const width = Math.min(0.22 * Math.min(a.h, b.h), 0.5 * Math.min(a.w, b.w));
	const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
	const d = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
	const n = { x: -d.y, y: d.x };
	const at = (p: Point, along: number, side: number) => ({
		x: p.x + d.x * along + n.x * side,
		y: p.y + d.y * along + n.y * side
	});
	const band = (start: number, end: number, half: number) => {
		// Sides pinched by 15% of the width at the middle: a quadratic's midpoint is a quarter of
		// the way to its control point from the chord, so the control sits twice the pinch in.
		const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
		const pinch = 0.15 * width;
		const c1 = at(mid, 0, half - 2 * pinch);
		const c2 = at(mid, 0, -(half - 2 * pinch));
		const pts = [
			at(from, -start, half),
			at(to, end, half),
			at(to, end, -half),
			at(from, -start, -half)
		];
		const xy = (p: Point) => `${f(p.x)} ${f(p.y)}`;
		return `M ${xy(pts[0])} Q ${xy(c1)} ${xy(pts[1])} L ${xy(pts[2])} Q ${xy(c2)} ${xy(pts[3])} Z`;
	};
	return {
		width,
		outline: band(width, width, width / 2),
		fill: band(2 * stroke, 2 * stroke, width / 2 - stroke / 2)
	};
}

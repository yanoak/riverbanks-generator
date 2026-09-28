// Balloon outlines as SVG paths in balloon-local coordinates (0,0 = top-left of the box).
// The tail point is also balloon-local, so a tail moves with its balloon.

import type { BalloonType, Point } from '$lib/model/types';

export interface BalloonShape {
	/** Filled and stroked; drawn stroke-first then fill-on-top so overlaps read as one outline. */
	paths: string[];
	/** Thought-balloon trailing bubbles. */
	circles: { cx: number; cy: number; r: number }[];
	dashed: boolean;
}

const f = (n: number) => Math.round(n * 100) / 100;

function ellipsePoint(w: number, h: number, angle: number): Point {
	return { x: w / 2 + (w / 2) * Math.cos(angle), y: h / 2 + (h / 2) * Math.sin(angle) };
}

function ellipsePath(w: number, h: number): string {
	const rx = w / 2;
	const ry = h / 2;
	return `M 0 ${f(ry)} A ${f(rx)} ${f(ry)} 0 1 1 ${f(w)} ${f(ry)} A ${f(rx)} ${f(ry)} 0 1 1 0 ${f(ry)} Z`;
}

/** Angle (in the ellipse's parametric space) facing a point. */
function facing(w: number, h: number, p: Point): number {
	return Math.atan2((p.y - h / 2) / (h / 2), (p.x - w / 2) / (w / 2));
}

/** Where a speech tail meets the ellipse: two boundary points either side of the facing angle. */
export function tailBase(w: number, h: number, tail: Point, spread = 0.22) {
	const a = facing(w, h, tail);
	return { left: ellipsePoint(w, h, a - spread), right: ellipsePoint(w, h, a + spread), angle: a };
}

function tailPath(w: number, h: number, tail: Point): string {
	const { left, right } = tailBase(w, h, tail);
	// Slight curve: control points pulled towards the balloon centre line.
	const c = { x: w / 2, y: h / 2 };
	const ctrl = (p: Point) => ({ x: (p.x * 2 + tail.x + c.x) / 4, y: (p.y * 2 + tail.y + c.y) / 4 });
	const cl = ctrl(left);
	const cr = ctrl(right);
	return `M ${f(left.x)} ${f(left.y)} Q ${f(cl.x)} ${f(cl.y)} ${f(tail.x)} ${f(tail.y)} Q ${f(cr.x)} ${f(cr.y)} ${f(right.x)} ${f(right.y)} Z`;
}

function cloudPath(w: number, h: number): string {
	const bumps = Math.max(8, Math.round((w + h) / 28));
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

function spikyPath(w: number, h: number, tail?: Point): string {
	const spikes = 18;
	const tailAngle = tail ? facing(w, h, tail) : null;
	const pts: Point[] = [];
	for (let i = 0; i < spikes * 2; i++) {
		const a = (i / (spikes * 2)) * Math.PI * 2;
		const outer = i % 2 === 0;
		const k = outer ? 1.08 : 0.86;
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

export function balloonShape(type: BalloonType, w: number, h: number, tail?: Point): BalloonShape {
	const none: BalloonShape = { paths: [], circles: [], dashed: false };
	switch (type) {
		case 'sfx':
			return none;
		case 'caption':
			return { ...none, paths: [`M 0 0 H ${f(w)} V ${f(h)} H 0 Z`] };
		case 'thought':
			return { ...none, paths: [cloudPath(w, h)], circles: tail ? thoughtTrail(w, h, tail) : [] };
		case 'shout':
			return { ...none, paths: [spikyPath(w, h, tail)] };
		case 'speech':
		case 'whisper':
			return {
				paths: [ellipsePath(w, h), ...(tail ? [tailPath(w, h, tail)] : [])],
				circles: [],
				dashed: type === 'whisper'
			};
	}
}

/** Fraction of width/height to pad text so it sits inside the shape. */
export function textInset(type: BalloonType): number {
	if (type === 'caption' || type === 'sfx') return 0.06;
	if (type === 'shout') return 0.2;
	return 0.15; // ellipse: the inscribed rectangle leaves ~14.6% each side
}

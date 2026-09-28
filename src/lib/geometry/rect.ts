import type { Rect } from '$lib/model/types';

export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface Delta {
	dx: number;
	dy: number;
}

export function moveRect(r: Rect, { dx, dy }: Delta): Rect {
	return { ...r, x: r.x + dx, y: r.y + dy };
}

/** Resize by dragging a handle; the opposite edge stays put, even when clamped to `min`. */
export function resizeRect(r: Rect, handle: Handle, { dx, dy }: Delta, min = 24): Rect {
	let left = r.x;
	let top = r.y;
	let right = r.x + r.w;
	let bottom = r.y + r.h;
	if (handle.includes('w')) left = Math.min(left + dx, right - min);
	if (handle.includes('e')) right = Math.max(right + dx, left + min);
	if (handle.includes('n')) top = Math.min(top + dy, bottom - min);
	if (handle.includes('s')) bottom = Math.max(bottom + dy, top + min);
	return { x: left, y: top, w: right - left, h: bottom - top };
}

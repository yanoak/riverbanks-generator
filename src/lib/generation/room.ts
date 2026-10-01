// Where a panel's lettering will sit, so its picture can keep that part quiet (prompt.ts
// roomSentence). Worked out from the balloons already over the panel; the top when there are
// none, which is where most lettering goes.

import type { Rect } from '$lib/model/types';

export const ROOM_KEYS = [
	'top',
	'upper-left',
	'upper-right',
	'left',
	'right',
	'bottom',
	'lower-left',
	'lower-right'
] as const;

export type Room = (typeof ROOM_KEYS)[number];

export const isRoom = (v: unknown): v is Room => ROOM_KEYS.includes(v as Room);

/** The balloons' overlap with the panel, centred by area, named as a part of the panel. */
export function letteringRoom(box: Rect, balloons: Rect[]): Room {
	let area = 0;
	let cx = 0;
	let cy = 0;
	for (const b of balloons) {
		const x0 = Math.max(box.x, b.x);
		const y0 = Math.max(box.y, b.y);
		const x1 = Math.min(box.x + box.w, b.x + b.w);
		const y1 = Math.min(box.y + box.h, b.y + b.h);
		if (x1 <= x0 || y1 <= y0) continue;
		const a = (x1 - x0) * (y1 - y0);
		area += a;
		cx += (a * (x0 + x1)) / 2;
		cy += (a * (y0 + y1)) / 2;
	}
	if (!area) return 'top';
	const u = (cx / area - box.x) / box.w;
	const v = (cy / area - box.y) / box.h;
	const col = u < 0.4 ? 'left' : u > 0.6 ? 'right' : '';
	const row = v < 0.4 ? 'upper' : v > 0.6 ? 'lower' : '';
	if (row === 'upper') return col ? `upper-${col}` : 'top';
	if (row === 'lower') return col ? `lower-${col}` : 'bottom';
	return col || 'top';
}

import { gridArea } from '$lib/geometry/grid';
import { newId } from './factory';
import type { Balloon, BalloonType, Page, Rect } from './types';

// What createBalloon stamped on every balloon before lettering came from the style
// (typography/typography.ts treats these as unset).
export const LETTERING_FONT = "'Comic Neue', 'Comic Sans MS', cursive";
export const SFX_FONT = "'Bangers', 'Impact', sans-serif";

const DEFAULTS: Record<BalloonType, { w: number; h: number; html: string; fontSize: number }> = {
	speech: { w: 260, h: 150, html: '<p>WHAT A <strong>DAY</strong>!</p>', fontSize: 26 },
	whisper: { w: 240, h: 140, html: '<p>psst… over here</p>', fontSize: 24 },
	thought: { w: 280, h: 170, html: '<p>I wonder…</p>', fontSize: 26 },
	shout: { w: 300, h: 190, html: '<p><strong>LOOK OUT!</strong></p>', fontSize: 32 },
	caption: { w: 320, h: 90, html: '<p>Meanwhile, by the river…</p>', fontSize: 24 },
	sfx: { w: 300, h: 130, html: '<p>KRAK!</p>', fontSize: 84 }
};

const HAS_TAIL: BalloonType[] = ['speech', 'whisper', 'thought', 'shout'];

/** A new balloon of the given type, centred horizontally in `box` (default: the grid's area). */
export function createBalloon(page: Page, type: BalloonType, box?: Rect): Balloon {
	const area = box ?? gridArea(page.grid, page);
	const d = DEFAULTS[type];
	const w = Math.min(d.w, area.w * 0.9);
	const h = Math.min(d.h, area.h * 0.9);
	// Captions sit at the top of a panel; balloons in its upper third.
	const y = type === 'caption' ? area.y + 12 : area.y + area.h * 0.3 - h / 2;
	const z = Math.max(0, ...page.balloons.map((b) => b.z)) + 1;
	return {
		id: newId(),
		type,
		x: area.x + (area.w - w) / 2,
		y: Math.max(area.y, y),
		w,
		h,
		z,
		tail: HAS_TAIL.includes(type) ? { x: w * 0.35, y: h + h * 0.6 } : undefined,
		html: d.html,
		fontSize: d.fontSize,
		fill: type === 'caption' ? '#fff4c2' : type === 'sfx' ? '#ffd23f' : '#ffffff',
		stroke: '#000000'
	};
}

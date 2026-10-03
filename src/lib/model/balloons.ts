import { BALLOON_STROKE, roundnessOf } from '$lib/geometry/balloon';
import { gridArea } from '$lib/geometry/grid';
import { panelBox } from '$lib/geometry/panel';
import { newId } from './factory';
import type { Balloon, BalloonAnchor, BalloonType, Page, Rect } from './types';

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
	sfx: { w: 300, h: 130, html: '<p>KRAK!</p>', fontSize: 84 },
	title: { w: 700, h: 200, html: '<p>ACT <mark>ONE</mark></p>', fontSize: 96 }
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
		// A title has no outline: its stroke is the accent colour, the posters' yellow.
		stroke: type === 'title' ? '#eeff41' : '#000000'
	};
}

// --- anchoring to a panel corner -------------------------------------------------------------

/** Shapes without a roundness (clouds, spikes) overhang like an ellipse. */
const cornerRoundness = (b: Balloon) =>
	b.type === 'speech' || b.type === 'whisper' || b.type === 'caption'
		? roundnessOf(b.type, b.roundness)
		: 1;

/**
 * Put the balloon in its anchor's corner, overhanging the panel by the stroke plus the depth of
 * the corner arc at 45°, so the panel border (which clips it, see PageView) cuts through the
 * rounded corner the way a hand-lettered balloon tucked into a corner looks. A box loses just
 * its own border on those two sides and sits flush.
 */
function pin(page: Page, b: Balloon, anchor: BalloonAnchor, keepTailTip: boolean): boolean {
	const panel = page.panels.find((p) => p.id === anchor.panelId);
	if (!panel) return false;
	const box = panelBox(page, panel);
	const r = cornerRoundness(b);
	const ox = BALLOON_STROKE / 2 + 0.293 * ((r * b.w) / 2);
	const oy = BALLOON_STROKE / 2 + 0.293 * ((r * b.h) / 2);
	const left = anchor.corner[1] === 'l';
	const top = anchor.corner[0] === 't';
	const x = left ? box.x - ox : box.x + box.w - b.w + ox;
	const y = top ? box.y - oy : box.y + box.h - b.h + oy;
	// Anchoring keeps the tail on its speaker; re-pinning moves it with the panel.
	if (b.tail && keepTailTip) b.tail = { x: b.tail.x + b.x - x, y: b.tail.y + b.y - y };
	b.x = x;
	b.y = y;
	return true;
}

export function anchorBalloon(page: Page, balloonId: string, anchor: BalloonAnchor): void {
	const b = page.balloons.find((x) => x.id === balloonId);
	if (!b) throw new Error(`No balloon ${balloonId} on this page.`);
	if (!pin(page, b, anchor, true)) throw new Error(`No panel ${anchor.panelId} on this page.`);
	b.anchor = { ...anchor };
}

/** Re-seat anchored balloons after the panels moved; one whose panel is gone lets go. */
export function repinAnchors(page: Page): void {
	for (const b of page.balloons) {
		if (b.anchor && !pin(page, b, b.anchor, false)) delete b.anchor;
	}
}

// --- connected balloons --------------------------------------------------------------------

/** Make `toId` the next line after `fromId` (null unlinks). Refuses itself and loops. */
export function connectBalloons(page: Page, fromId: string, toId: string | null): void {
	const byId = (id: string) => {
		const b = page.balloons.find((x) => x.id === id);
		if (!b) throw new Error(`No balloon ${id} on this page.`);
		return b;
	};
	const from = byId(fromId);
	if (toId === null) {
		delete from.next;
		delete from.connector;
		return;
	}
	if (toId === fromId) throw new Error('A balloon can’t connect to itself.');
	byId(toId);
	for (let id: string | undefined = toId, steps = 0; id; steps++) {
		if (id === fromId || steps > page.balloons.length) {
			throw new Error('That would make a loop: the chain already leads back to this balloon.');
		}
		id = page.balloons.find((x) => x.id === id)?.next;
	}
	from.next = toId;
}

/** Delete a balloon and any connection that led to it. */
export function removeBalloon(page: Page, id: string): void {
	page.balloons = page.balloons.filter((b) => b.id !== id);
	for (const b of page.balloons) {
		if (b.next === id) {
			delete b.next;
			delete b.connector;
		}
	}
}

/** The angle an sfx's lettering is drawn at: its own, or the house tilt of −6°. */
export function sfxRotation(b: Pick<Balloon, 'rotation'>): number {
	return Math.min(180, Math.max(-180, b.rotation ?? -6));
}

/** Balloon types that can be tilted: an sfx's lettering, or a whole caption. */
export const ROTATES: readonly Balloon['type'][] = ['sfx', 'caption'];

/** A balloon's tilt in degrees: an sfx's lettering (−6° by default), a caption (0°), else none. */
export function balloonRotation(b: Pick<Balloon, 'type' | 'rotation'>): number {
	if (b.type === 'sfx') return sfxRotation(b);
	if (b.type === 'caption') return Math.min(180, Math.max(-180, b.rotation ?? 0));
	return 0;
}

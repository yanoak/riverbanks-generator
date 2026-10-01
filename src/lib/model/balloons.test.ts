import { describe, expect, it } from 'vitest';
import { createComic, createPage } from './factory';
import {
	anchorBalloon,
	connectBalloons,
	createBalloon,
	removeBalloon,
	repinAnchors
} from './balloons';
import { panelBox } from '$lib/geometry/panel';
import { BALLOON_STROKE } from '$lib/geometry/balloon';

describe('createBalloon', () => {
	it('places a balloon with no box inside the grid, clear of the header and footer', () => {
		const board = createComic('t', 'board').pages[0];
		for (const type of ['caption', 'speech'] as const) {
			const b = createBalloon(board, type);
			expect(b.y).toBeGreaterThanOrEqual(208);
			expect(b.y + b.h).toBeLessThanOrEqual(1416 - 208);
		}
	});

	it('centres the balloon in the given box', () => {
		const page = createPage();
		const b = createBalloon(page, 'speech', { x: 100, y: 100, w: 400, h: 400 });
		expect(b.x + b.w / 2).toBeCloseTo(300);
		expect(b.y + b.h / 2).toBeLessThan(300); // sits in the upper part of the panel
	});

	it('gives tails to speech-like types only', () => {
		const page = createPage();
		expect(createBalloon(page, 'speech').tail).toBeDefined();
		expect(createBalloon(page, 'thought').tail).toBeDefined();
		expect(createBalloon(page, 'caption').tail).toBeUndefined();
		expect(createBalloon(page, 'sfx').tail).toBeUndefined();
	});

	it('stacks new balloons above existing ones', () => {
		const page = createPage();
		const a = createBalloon(page, 'speech');
		page.balloons.push(a);
		expect(createBalloon(page, 'caption').z).toBeGreaterThan(a.z);
	});

	it('leaves the font to the style', () => {
		const page = createPage();
		expect(createBalloon(page, 'sfx').font).toBeUndefined();
	});
});

describe('anchoring to a panel corner', () => {
	function board() {
		const page = createComic('t', 'board').pages[0];
		const panel = page.panels[0]; // top-left cell
		const box = panelBox(page, panel);
		const b = createBalloon(page, 'speech');
		page.balloons.push(b);
		return { page, panel, box, b };
	}

	it('overhangs the chosen corner so the border cuts through the rounded corner', () => {
		const { page, panel, box, b } = board();
		const over = (r: number, size: number) => BALLOON_STROKE / 2 + 0.293 * ((r * size) / 2);
		for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
			anchorBalloon(page, b.id, { panelId: panel.id, corner });
			expect(b.anchor).toEqual({ panelId: panel.id, corner });
			const left = corner[1] === 'l';
			const top = corner[0] === 't';
			const x = left ? box.x - over(1, b.w) : box.x + box.w - b.w + over(1, b.w);
			const y = top ? box.y - over(1, b.h) : box.y + box.h - b.h + over(1, b.h);
			expect(b.x).toBeCloseTo(x, 6);
			expect(b.y).toBeCloseTo(y, 6);
		}
	});

	it('loses only its own border on a box', () => {
		const { page, panel, box, b } = board();
		b.roundness = 0;
		anchorBalloon(page, b.id, { panelId: panel.id, corner: 'tl' });
		expect(b.x).toBeCloseTo(box.x - BALLOON_STROKE / 2, 6);
	});

	it('follows its corner when the grid changes', () => {
		const { page, panel, b } = board();
		anchorBalloon(page, b.id, { panelId: panel.id, corner: 'br' });
		const before = { x: b.x, y: b.y };
		page.grid.margin += 30;
		repinAnchors(page);
		const box = panelBox(page, page.panels[0]);
		expect(b.x).not.toBe(before.x);
		expect(b.x + b.w).toBeCloseTo(box.x + box.w + BALLOON_STROKE / 2 + 0.293 * (b.w / 2), 6);
	});

	it('lets go of a panel that is gone, and stays where it was', () => {
		const { page, panel, b } = board();
		anchorBalloon(page, b.id, { panelId: panel.id, corner: 'tl' });
		const at = { x: b.x, y: b.y };
		page.panels = page.panels.filter((p) => p.id !== panel.id);
		repinAnchors(page);
		expect(b.anchor).toBeUndefined();
		expect({ x: b.x, y: b.y }).toEqual(at);
	});

	it('refuses an unknown panel', () => {
		const { page, b } = board();
		expect(() => anchorBalloon(page, b.id, { panelId: 'nope', corner: 'tl' })).toThrow(/panel/);
	});
});

describe('connecting balloons', () => {
	function three() {
		const page = createComic('t', 'board').pages[0];
		const [a, b, c] = ['speech', 'speech', 'speech'].map(() => {
			const x = createBalloon(page, 'speech');
			page.balloons.push(x);
			return x;
		});
		return { page, a, b, c };
	}

	it('chains a balloon to the next, and unlinks', () => {
		const { page, a, b } = three();
		connectBalloons(page, a.id, b.id);
		expect(a.next).toBe(b.id);
		connectBalloons(page, a.id, null);
		expect(a).not.toHaveProperty('next');
	});

	it('refuses itself, an unknown balloon and a cycle', () => {
		const { page, a, b, c } = three();
		expect(() => connectBalloons(page, a.id, a.id)).toThrow(/itself/);
		expect(() => connectBalloons(page, a.id, 'nope')).toThrow(/No balloon/);
		connectBalloons(page, a.id, b.id);
		connectBalloons(page, b.id, c.id);
		expect(() => connectBalloons(page, c.id, a.id)).toThrow(/loop/);
	});

	it('drops connections to a deleted balloon, with their connector style', () => {
		const { page, a, b } = three();
		connectBalloons(page, a.id, b.id);
		a.connector = 'line';
		removeBalloon(page, b.id);
		expect(page.balloons.map((x) => x.id)).not.toContain(b.id);
		expect(a).not.toHaveProperty('next');
		expect(a).not.toHaveProperty('connector');
	});
});

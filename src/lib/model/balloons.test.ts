import { describe, expect, it } from 'vitest';
import { PatchCommand } from './commands/patch';
import { createPage } from './factory';
import { createBalloon } from './balloons';

describe('createBalloon', () => {
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

	it('uses a display font for sfx', () => {
		const page = createPage();
		expect(createBalloon(page, 'sfx').font).toMatch(/Bangers/);
	});
});

describe('balloon move + resize', () => {
	it('is one undo step from start and end geometry', () => {
		const page = createPage();
		const b = createBalloon(page, 'speech');
		const start = { x: b.x, y: b.y, w: b.w, h: b.h };
		Object.assign(b, { x: 10, y: 20, w: 300, h: 200 }); // live drag
		const cmd = PatchCommand.fromChange('Resize balloon', b, start)!;
		cmd.undo();
		expect({ x: b.x, y: b.y, w: b.w, h: b.h }).toEqual(start);
		cmd.execute();
		expect(b.w).toBe(300);
	});
});

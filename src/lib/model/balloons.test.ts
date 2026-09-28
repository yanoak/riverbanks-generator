import { describe, expect, it } from 'vitest';
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

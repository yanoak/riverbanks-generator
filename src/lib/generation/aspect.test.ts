import { describe, expect, it } from 'vitest';
import { nearestAspect, ratioOf } from './aspect';

const GEMINI = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

describe('nearestAspect', () => {
	it('picks the closest supported ratio in log space', () => {
		expect(nearestAspect({ w: 1000, h: 1000 }, GEMINI)).toBe('1:1');
		expect(nearestAspect({ w: 300, h: 460 }, GEMINI)).toBe('2:3');
		expect(nearestAspect({ w: 900, h: 300 }, GEMINI)).toBe('21:9');
		expect(nearestAspect({ w: 400, h: 330 }, GEMINI)).toBe('5:4');
	});

	it('is symmetric: 2× too wide and 2× too tall are equally far', () => {
		expect(nearestAspect({ w: 2, h: 1 }, ['1:1', '4:1'])).toBe('1:1');
		expect(nearestAspect({ w: 1, h: 2 }, ['1:1', '1:4'])).toBe('1:1');
	});

	it('only chooses from the model’s list', () => {
		expect(nearestAspect({ w: 100, h: 800 }, ['1:1', '9:16'])).toBe('9:16');
	});

	it('handles a degenerate box', () => {
		expect(nearestAspect({ w: 0, h: 100 }, GEMINI)).toBe('9:16');
	});
});

describe('ratioOf', () => {
	it('parses W:H', () => expect(ratioOf('16:9')).toBeCloseTo(16 / 9));
});

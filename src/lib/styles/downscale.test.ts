import { describe, expect, it } from 'vitest';
import { fitWithin } from './downscale';

describe('fitWithin', () => {
	it('shrinks the long side to the limit, keeping the ratio', () => {
		expect(fitWithin(3000, 2000, 1536)).toEqual({ width: 1536, height: 1024 });
		expect(fitWithin(1000, 4000, 1536)).toEqual({ width: 384, height: 1536 });
	});

	it('never enlarges, and never rounds a side to zero', () => {
		expect(fitWithin(800, 600, 1536)).toEqual({ width: 800, height: 600 });
		expect(fitWithin(10000, 2, 1536)).toEqual({ width: 1536, height: 1 });
	});
});

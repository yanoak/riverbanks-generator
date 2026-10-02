import { describe, expect, it } from 'vitest';
import { bandInk, isColour } from './page';

describe('bandInk', () => {
	it('letters bands dark on a white page, and on the light yellow of Act One', () => {
		expect(bandInk(undefined)).toBe('#1c1917');
		expect(bandInk('#ffffff')).toBe('#1c1917');
		expect(bandInk('#eeff41')).toBe('#1c1917');
	});

	it('letters bands white on the dark act colours', () => {
		for (const c of ['#6b7866', '#c4553d', '#ae7b50', '#2e6b65', '#1d2a33'])
			expect(bandInk(c)).toBe('#ffffff');
	});
});

describe('isColour', () => {
	it('takes #rrggbb only', () => {
		expect(isColour('#6b7866')).toBe(true);
		expect(isColour('red')).toBe(false);
		expect(isColour('#fff')).toBe(false);
	});
});

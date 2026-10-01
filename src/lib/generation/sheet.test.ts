import { describe, expect, it } from 'vitest';
import { sheetPrompt } from './sheet';

describe('sheetPrompt', () => {
	it('asks for three views of a character, with the description', () => {
		const p = sheetPrompt({ kind: 'character', name: 'Ya at 20', description: 'Short black bob' });
		expect(p).toMatch(/^A character model sheet of Ya at 20: .*front, three-quarter and side view/);
		expect(p).toMatch(/Short black bob\.$/);
	});

	it('props get an object sheet, places a view with nobody in it', () => {
		expect(sheetPrompt({ kind: 'object', name: 'the drone', description: '' })).toMatch(
			/^An object model sheet of the drone: .*background\.$/
		);
		expect(sheetPrompt({ kind: 'place', name: 'the stilt restaurant', description: '' })).toMatch(
			/no people in it\.$/
		);
	});

	it('copes with an unnamed member', () => {
		expect(sheetPrompt({ kind: 'character', name: ' ', description: '' })).toContain(
			'sheet of this character'
		);
	});
});

import { describe, expect, it } from 'vitest';
import { composePrompt, NO_LETTERING, roomSentence } from './prompt';
import { ROOM_KEYS } from './room';

const profile = {
	style: 'Loose brush ink, heavy blacks.',
	palette: [{ hex: '#1d3557', name: 'deep navy' }, { hex: '#e76f51' }],
	avoid: 'gradients, photorealism'
};

describe('composePrompt', () => {
	it('orders style, palette, avoid, references, then the panel prompt', () => {
		const text = composePrompt({
			profile,
			refs: [
				{ role: 'style', label: '' },
				{ role: 'character', label: 'Mae' },
				{ role: 'object', label: 'the raft' }
			],
			prompt: 'Mae poling the raft at dawn, wide shot'
		});
		expect(text).toBe(
			[
				'Draw one comic panel.',
				'',
				'Style: Loose brush ink, heavy blacks.',
				'Palette: keep to these colours: #1d3557 (deep navy), #e76f51.',
				'Avoid: gradients, photorealism.',
				'',
				'Reference images, in the order attached:',
				'- Image 1: a style reference. Match its look, not its content.',
				'- Image 2: the character “Mae”. Keep their appearance consistent.',
				'- Image 3: the object “the raft”. Keep its appearance consistent.',
				'',
				NO_LETTERING,
				'',
				'Panel: Mae poling the raft at dawn, wide shot'
			].join('\n')
		);
	});

	it('omits empty sections', () => {
		const text = composePrompt({
			profile: { style: '', palette: [], avoid: 'text' },
			refs: [],
			prompt: 'a heron'
		});
		expect(text).not.toMatch(/Style:|Palette:|Reference images/);
		expect(text).toContain('Avoid: text.');
	});

	it('an unlabelled character is described by role alone', () => {
		const text = composePrompt({ refs: [{ role: 'character', label: '' }], prompt: 'x' });
		expect(text).toContain('- Image 1: a character. Keep their appearance consistent.');
	});

	it('with no style it is the lettering note and the bare prompt', () => {
		expect(composePrompt({ refs: [], prompt: '  a heron  ' })).toBe(
			`Draw one comic panel.\n\n${NO_LETTERING}\n\nPanel: a heron`
		);
	});

	it('does not double the full stop the person typed', () => {
		const text = composePrompt({
			profile: { style: '', palette: [], avoid: 'gradients.' },
			refs: [],
			prompt: 'x'
		});
		expect(text).toContain('Avoid: gradients.\n');
	});

	it('describes the panel’s cast after the references, with image numbers where attached', () => {
		const text = composePrompt({
			refs: [
				{ role: 'style', label: '' },
				{ role: 'character', label: 'Ismahan at 42' },
				{ role: 'place', label: 'the stilt restaurant' }
			],
			cast: [
				{ name: 'Ismahan at 42', description: 'Long dark braid streaked grey', image: 2 },
				{ name: 'Ya at 20', description: 'Short black bob, red apron.', image: null },
				{ name: 'the stilt restaurant', description: '', image: 3 },
				{ name: 'Taro', description: '  ', image: null }
			],
			prompt: 'Ya cooks; Ismahan listens'
		});
		expect(text).toContain(
			[
				'- Image 3: the place “the stilt restaurant”. Keep its appearance consistent.',
				'',
				'Cast in this panel:',
				'- Ismahan at 42 (Image 2): Long dark braid streaked grey.',
				'- Ya at 20: Short black bob, red apron.',
				'- the stilt restaurant (Image 3).',
				'',
				NO_LETTERING
			].join('\n')
		);
		expect(text).not.toContain('Taro');
	});
});

describe('room for lettering', () => {
	it('follows the no-lettering line, naming where, and never asks for empty space', () => {
		const p = composePrompt({ refs: [], prompt: 'a heron', room: 'upper-left' });
		const after = p.split(NO_LETTERING)[1];
		expect(after.trimStart().startsWith(roomSentence('upper-left'))).toBe(true);
		expect(roomSentence('upper-left')).toContain('upper left');
		for (const key of ROOM_KEYS) {
			// Each of these words made the model draw a blank band or its own border (2026-10-02).
			expect(roomSentence(key)).not.toMatch(/empty|blank|frame|border|edge|paper|band/i);
			expect(roomSentence(key)).toMatch(/sky|water|wall/);
		}
	});

	it('adds nothing without a room (portraits, print versions)', () => {
		expect(composePrompt({ refs: [], prompt: 'a heron' })).toBe(
			`Draw one comic panel.\n\n${NO_LETTERING}\n\nPanel: a heron`
		);
	});
});

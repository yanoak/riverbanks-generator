import { describe, expect, it } from 'vitest';
import { composePrompt, NO_LETTERING } from './prompt';

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
});

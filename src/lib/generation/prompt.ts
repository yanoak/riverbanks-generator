// What is sent to the image model: the profile's written style, then what each reference image
// is, then the panel's prompt. Deterministic on purpose: the generations log keeps the exact
// text, so a surprising image can be traced to its words.

import type { PaletteColor, RefRole } from '$lib/styles/styles';

export const NO_LETTERING =
	'Leave out any lettering, captions, speech balloons and sound effects: they are added later.';

export interface PromptInput {
	profile?: { style: string; palette: PaletteColor[]; avoid: string };
	/** The references actually attached, in order. */
	refs: { role: RefRole; label: string }[];
	prompt: string;
}

const sentence = (s: string) => {
	const t = s.trim();
	return /[.!?]$/.test(t) ? t : `${t}.`;
};

function describeRef(ref: { role: RefRole; label: string }, n: number): string {
	const name = ref.label.trim();
	switch (ref.role) {
		case 'style':
			return `- Image ${n}: a style reference. Match its look, not its content.`;
		case 'character':
			return `- Image ${n}: ${name ? `the character “${name}”` : 'a character'}. Keep their appearance consistent.`;
		case 'object':
			return `- Image ${n}: ${name ? `the object “${name}”` : 'an object'}. Keep its appearance consistent.`;
	}
}

export function composePrompt({ profile, refs, prompt }: PromptInput): string {
	const blocks: string[][] = [['Draw one comic panel.']];

	const style: string[] = [];
	if (profile?.style.trim()) style.push(`Style: ${sentence(profile.style)}`);
	if (profile?.palette.length) {
		const colours = profile.palette.map((c) => (c.name ? `${c.hex} (${c.name})` : c.hex));
		style.push(`Palette: keep to these colours: ${colours.join(', ')}.`);
	}
	if (profile?.avoid.trim()) style.push(`Avoid: ${sentence(profile.avoid)}`);
	if (style.length) blocks.push(style);

	if (refs.length)
		blocks.push([
			'Reference images, in the order attached:',
			...refs.map((r, i) => describeRef(r, i + 1))
		]);

	blocks.push([NO_LETTERING], [`Panel: ${prompt.trim()}`]);
	return blocks.map((b) => b.join('\n')).join('\n\n');
}

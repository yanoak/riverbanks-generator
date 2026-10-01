// What is sent to the image model: the profile's written style, then what each reference image
// is, then the panel's prompt. Deterministic on purpose: the generations log keeps the exact
// text, so a surprising image can be traced to its words.

import type { PaletteColor, RefRole } from '$lib/styles/styles';
import type { Room } from './room';

export type PromptRefRole = RefRole | 'place';

export const NO_LETTERING =
	'Leave out any lettering, captions, speech balloons and sound effects: they are added later.';

/**
 * Room for the lettering that will be laid over the picture. It says what fills that part, not
 * that it is empty: asked for "empty space", image models paint a blank band (2026-10-02, the
 * Hilsa drone panels), and a style whose palette names a paper colour leaves it as bare paper.
 */
export function roomSentence(room: Room): string {
	const where = room.replace('-', ' ');
	return (
		`Lettering will sit over the ${where} of the frame, so keep that part quiet and low in ` +
		'detail: the scene’s own sky, water, wall or ground, continuing right to the edges, with ' +
		'no faces or key action there. Never leave a blank or empty area, a plain band, a box or a ' +
		'frame for it: the picture fills the whole panel, and backgrounds are part of the scene, ' +
		'never bare paper.'
	);
}

export interface PromptInput {
	profile?: { style: string; palette: PaletteColor[]; avoid: string };
	/** The references actually attached, in order. */
	refs: { role: PromptRefRole; label: string }[];
	/** The style's cast members this panel needs; `image` is the 1-based number of the portrait. */
	cast?: { name: string; description: string; image: number | null }[];
	prompt: string;
	/** Where the panel's lettering goes; absent for portraits and print redraws. */
	room?: Room;
}

const sentence = (s: string) => {
	const t = s.trim();
	return /[.!?]$/.test(t) ? t : `${t}.`;
};

function describeRef(ref: { role: PromptRefRole; label: string }, n: number): string {
	const name = ref.label.trim();
	switch (ref.role) {
		case 'style':
			return `- Image ${n}: a style reference. Match its look, not its content.`;
		case 'character':
			return `- Image ${n}: ${name ? `the character “${name}”` : 'a character'}. Keep their appearance consistent.`;
		case 'object':
			return `- Image ${n}: ${name ? `the object “${name}”` : 'an object'}. Keep its appearance consistent.`;
		case 'place':
			return `- Image ${n}: ${name ? `the place “${name}”` : 'a place'}. Keep its appearance consistent.`;
	}
}

function describeMember(m: { name: string; description: string; image: number | null }): string {
	const where = m.image ? ` (Image ${m.image})` : '';
	const what = m.description.trim();
	return `- ${m.name.trim()}${where}${what ? `: ${sentence(what)}` : '.'}`;
}

export function composePrompt({ profile, refs, cast = [], prompt, room }: PromptInput): string {
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

	const members = cast.filter((m) => m.image || m.description.trim());
	if (members.length) blocks.push(['Cast in this panel:', ...members.map(describeMember)]);

	blocks.push(room ? [NO_LETTERING, roomSentence(room)] : [NO_LETTERING], [
		`Panel: ${prompt.trim()}`
	]);
	return blocks.map((b) => b.join('\n')).join('\n\n');
}

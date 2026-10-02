// A style's lettering: one font per balloon type. Balloons with no font of their own follow
// their comic's style, live; a style stores only the types its creator changed.

import { LETTERING_FONT, SFX_FONT } from '$lib/model/balloons';
import type { Balloon, BalloonType } from '$lib/model/types';
import { fontNamed, fontStack, nearestWeight } from './fonts';

export interface Lettering {
	family: string;
	weight: number;
	italic: boolean;
	uppercase: boolean;
}

export type Typography = Record<BalloonType, Lettering>;

export const BALLOON_TYPES: BalloonType[] = [
	'speech',
	'thought',
	'whisper',
	'shout',
	'caption',
	'sfx',
	'title'
];

const rubik = (weight: number, italic = false, uppercase = false): Lettering => ({
	family: 'Rubik',
	weight,
	italic,
	uppercase
});

/** The house lettering, after Sam's slides: Rubik, with narration in italic capitals. */
export const DEFAULT_TYPOGRAPHY: Typography = {
	speech: rubik(500),
	thought: rubik(400, true),
	whisper: rubik(400),
	shout: rubik(800, false, true),
	caption: rubik(600, true, true),
	sfx: { family: 'Rubik Dirt', weight: 400, italic: false, uppercase: false },
	title: { family: 'Rubik Microbe', weight: 400, italic: false, uppercase: true }
};

function valid(value: unknown, fallback: Lettering): Lettering {
	if (!value || typeof value !== 'object') return fallback;
	const v = value as Partial<Lettering>;
	const font = typeof v.family === 'string' ? fontNamed(v.family) : undefined;
	if (!font) return fallback;
	return {
		family: font.family,
		weight: nearestWeight(font, typeof v.weight === 'number' ? v.weight : 400),
		italic: v.italic === true,
		uppercase: v.uppercase === true
	};
}

/** A style's stored typography (any subset, possibly junk) filled out from the house default. */
export function resolveTypography(stored: Partial<Typography> | null | undefined): Typography {
	const t = {} as Typography;
	for (const type of BALLOON_TYPES) {
		t[type] = valid(stored?.[type], DEFAULT_TYPOGRAPHY[type]);
	}
	return t;
}

/**
 * Whether the balloon follows its style. createBalloon used to stamp LETTERING_FONT (SFX_FONT on
 * an sfx) on every balloon; those stamps were never a choice, so they count as unset.
 */
export function followsStyle(b: Pick<Balloon, 'type' | 'font'>): boolean {
	return !b.font || b.font === (b.type === 'sfx' ? SFX_FONT : LETTERING_FONT);
}

export interface LetteringCss {
	fontFamily: string;
	fontWeight: number;
	fontStyle: 'italic' | 'normal';
	textTransform: 'uppercase' | 'none';
}

export function letteringCss(l: Lettering): LetteringCss {
	return {
		fontFamily: fontStack(l.family),
		fontWeight: l.weight,
		fontStyle: l.italic ? 'italic' : 'normal',
		textTransform: l.uppercase ? 'uppercase' : 'none'
	};
}

/** How a balloon is lettered: its own font, plain, or its style's lettering for its type. */
export function letteringFor(b: Pick<Balloon, 'type' | 'font'>, t: Typography): LetteringCss {
	if (followsStyle(b)) return letteringCss(t[b.type]);
	return { fontFamily: b.font!, fontWeight: 400, fontStyle: 'normal', textTransform: 'none' };
}

/** "Rubik 500 italic", for menus. */
export function describeLettering(l: Lettering): string {
	return [l.family, l.weight !== 400 || fontNamed(l.family)!.weights.length > 1 ? l.weight : '']
		.concat(l.italic ? ['italic'] : [], l.uppercase ? ['caps'] : [])
		.filter(Boolean)
		.join(' ');
}

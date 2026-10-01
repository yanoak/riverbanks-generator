// The fonts lettering can use. A fixed list, because a font the page hasn't loaded falls back
// silently and the PNG export only sees loaded fonts: every family here is requested in
// src/app.html (fonts.test.ts checks it).

export interface Font {
	family: string;
	weights: number[];
	/** The generic family a missing font falls back to. */
	fallback: string;
}

const RUBIK_WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

/** Rubik and its display cuts (Sam's slides), then the original comic fonts. */
export const FONTS: Font[] = [
	{ family: 'Rubik', weights: RUBIK_WEIGHTS, fallback: 'ui-sans-serif, system-ui, sans-serif' },
	...['Microbe', 'Dirt', 'Vinyl', 'Wet Paint', 'Pixels', 'Burned'].map((cut) => ({
		family: `Rubik ${cut}`,
		weights: [400],
		fallback: "'Rubik', sans-serif"
	})),
	{ family: 'Comic Neue', weights: [400, 700], fallback: 'cursive' },
	{ family: 'Bangers', weights: [400], fallback: 'sans-serif' },
	{ family: 'Patrick Hand', weights: [400], fallback: 'cursive' },
	{ family: 'Permanent Marker', weights: [400], fallback: 'cursive' }
];

export const fontNamed = (family: string): Font | undefined =>
	FONTS.find((f) => f.family === family);

/** The CSS font-family for a catalog font. */
export function fontStack(family: string): string {
	const font = fontNamed(family);
	return `'${family}', ${font?.fallback ?? 'sans-serif'}`;
}

/** The weight in `font` closest to `weight`. */
export function nearestWeight(font: Font, weight: number): number {
	return font.weights.reduce((best, w) =>
		Math.abs(w - weight) < Math.abs(best - weight) ? w : best
	);
}

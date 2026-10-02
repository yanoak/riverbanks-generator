// A page's own look: its background colour, and the band lettering that reads on it.

/** A colour as the page stores it: #rrggbb. */
export const isColour = (c: unknown): c is string =>
	typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

const DARK_INK = '#1c1917';
const LIGHT_INK = '#ffffff';

/** WCAG relative luminance of #rrggbb. */
function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The header and footer's lettering on this background: white unless the page is light. The
 * cut-off sits above mid-tones (Sam's brown Act Four is white on luminance 0.23, where black
 * would contrast slightly more), so only pale colours like Act One's yellow get dark ink.
 */
export function bandInk(background: string | undefined): string {
	if (!isColour(background)) return DARK_INK;
	return luminance(background) > 0.4 ? DARK_INK : LIGHT_INK;
}

/**
 * The prompt for a print version: a 4K redraw of the chosen image that must not become a
 * different picture. Two failures shaped the wording (2026-10-03, Prologue and Act One):
 * "do not add any text" made the model erase lettering drawn into the art, and naming the palette
 * as where the colours "come from" let it snap whole areas to palette colours (brown floodwater
 * turned river teal).
 */
export const PRINT_PROMPT =
	'Redraw this image at high resolution for print, as a faithful copy. Keep everything exactly ' +
	'as it is: the composition, framing, characters, poses, linework and texture, and every area ' +
	'in exactly the colour it has now. Keep any words or lettering already in the image exactly ' +
	'as written, letter for letter, in the same place and style. Do not add, remove or change ' +
	'anything, and do not add any new text.';

/**
 * PRINT_PROMPT, plus the style's palette so hues stay exact (a redraw once turned terracotta
 * salmon) — framed as a reference for matching, never as a reason to recolour.
 */
export function printPrompt(palette: string[]): string {
	if (!palette.length) return PRINT_PROMPT;
	return (
		`${PRINT_PROMPT} Do not recolour anything: each area keeps the colour it has. For exact ` +
		`hues, the image's colours are close to these: ${palette.join(', ')}.`
	);
}

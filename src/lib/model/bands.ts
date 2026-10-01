// What the header and footer bands say on a page: the comic's defaults (or the house ones),
// with the page's overrides on top and the tokens filled in.

import type { Bands, Comic } from './types';

/** After the slide master of Sam's "RIVERBANKS Paneling" deck. */
export const HOUSE_BANDS: Bands = {
	header: { title: '{comic}', subtitle: '' },
	footer: { left: 'RIVERBANKS', center: '{page}', right: 'SEAPUNK STUDIOS' }
};

export const BAND_TOKENS = ['{comic}', '{page}', '{pages}'];

/** The comic's default bands, before tokens. */
export const comicBands = (comic: Comic): Bands => comic.bands ?? HOUSE_BANDS;

function fill(text: string, comic: Comic, index: number): string {
	return text
		.replaceAll('{comic}', comic.title)
		.replaceAll('{pages}', String(comic.pages.length))
		.replaceAll('{page}', String(index + 1));
}

/** The text page `index` (0-based) shows in its bands. */
export function resolveBands(comic: Comic, index: number): Bands {
	const base = comicBands(comic);
	const own = comic.pages[index]?.bands;
	const header = { ...base.header, ...own?.header };
	const footer = { ...base.footer, ...own?.footer };
	return {
		header: {
			title: fill(header.title, comic, index),
			subtitle: fill(header.subtitle, comic, index)
		},
		footer: {
			left: fill(footer.left, comic, index),
			center: fill(footer.center, comic, index),
			right: fill(footer.right, comic, index)
		}
	};
}

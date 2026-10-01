// What the header and footer bands say on a page: the comic's defaults (or the house ones),
// with the page's overrides on top and the tokens filled in.

import type { BandOverrides, Bands, Comic, Page } from './types';

export type Band = keyof Bands;
export const BANDS: Band[] = ['header', 'footer'];

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

/** Slot-by-slot changes to a band; undefined slots are left alone. */
export type BandsPatch = BandOverrides;

/** Change the comic's defaults, starting from the house bands if it has none yet. */
export function setDefaultBands(comic: Comic, patch: BandsPatch): void {
	const base = comicBands(comic);
	comic.bands = {
		header: { ...base.header, ...defined(patch.header) },
		footer: { ...base.footer, ...defined(patch.footer) }
	};
}

/** Override slots on one page. */
export function setPageBands(page: Page, patch: BandsPatch): void {
	const next: BandOverrides = { ...page.bands };
	for (const band of BANDS) {
		const slots = defined(patch[band]);
		if (Object.keys(slots).length) next[band] = { ...next[band], ...slots } as never;
	}
	tidy(page, next);
}

/** Make page `index`'s version of `band` the comic's default, and drop its override. */
export function useOnEveryPage(comic: Comic, index: number, band: Band): void {
	const page = comic.pages[index];
	setDefaultBands(comic, { [band]: page.bands?.[band] ?? {} });
	resetPageBands(page, band);
}

/** Return a page to the comic's defaults: one band, or both. */
export function resetPageBands(page: Page, band?: Band): void {
	if (!band) return void delete page.bands;
	const next: BandOverrides = { ...page.bands };
	delete next[band];
	tidy(page, next);
}

function defined<T extends object>(slots: T | undefined): Partial<T> {
	return Object.fromEntries(
		Object.entries(slots ?? {}).filter(([, v]) => typeof v === 'string')
	) as Partial<T>;
}

function tidy(page: Page, next: BandOverrides) {
	for (const band of BANDS) if (next[band] && !Object.keys(next[band]!).length) delete next[band];
	if (Object.keys(next).length) page.bands = next;
	else delete page.bands;
}

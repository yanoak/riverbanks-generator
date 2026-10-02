// What the header and footer bands say on a page: the comic's defaults (or the house ones),
// with the page's overrides on top and the tokens filled in.

import type { BandOverrides, Bands, Comic, Page } from './types';

export type Band = keyof Bands;
export const BANDS: Band[] = ['header', 'footer'];

/**
 * The header after Yan's annotated A1 sheet; the footer after Yan's 2026-10-02 mock-up: the two
 * names at either end in Rubik Pixels, the site between them, no page number, title or QR.
 */
export const HOUSE_BANDS: Bands = {
	header: { title: '{comic}', subtitle: '' },
	footer: {
		left: 'RIVERBANKS',
		center: 'riverbanks.lol',
		right: 'SEAPUNK STUDIOS',
		qr: ''
	}
};

/** What a footer QR code encodes and links to: a bare host is taken to be https. */
export function qrHref(address: string): string {
	const a = address.trim();
	if (!a) return '';
	return /^[a-z][a-z0-9+.-]*:/i.test(a) ? a : `https://${a}`;
}

export const BAND_TOKENS = ['{comic}', '{page}', '{pages}'];

/** The comic's default bands, before tokens. */
export const comicBands = (comic: Comic): Bands => comic.bands ?? HOUSE_BANDS;

/** Whether the page has room for this band (its grid leaves a strip above or below). */
export const hasBand = (page: Page, band: Band): boolean =>
	((band === 'header' ? page.grid.top : page.grid.bottom) ?? 0) > 0;

/** Whether the page draws this band: it has room for it and hasn't switched it off. */
export const bandShown = (page: Page, band: Band): boolean =>
	hasBand(page, band) && !page.bands?.hidden?.includes(band);

/** Switch a band on or off on one page, keeping its text for when it comes back. */
export function setBandShown(page: Page, band: Band, shown: boolean): void {
	const hidden = (page.bands?.hidden ?? []).filter((b) => b !== band);
	if (!shown) hidden.push(band);
	const next: BandOverrides = { ...page.bands, hidden };
	tidy(page, next);
}

/** What resolving needs to know about the comic; the comics list has no more than this. */
export interface BandContext {
	title: string;
	bands?: Bands;
	pageCount: number;
}

/** A band's text on a page before tokens: the default, with the page's overrides on top. */
export function bandSource<B extends Band>(
	defaults: Bands | undefined,
	page: Page | undefined,
	band: B
): Bands[B] {
	// Fill from the house bands first: comics stored before a slot existed lack it.
	return {
		...HOUSE_BANDS[band],
		...(defaults ?? HOUSE_BANDS)[band],
		...page?.bands?.[band]
	} as Bands[B];
}

/** The text page `index` (0-based) shows in its bands. */
export function resolveBands(comic: Comic, index: number): Bands {
	return bandsFor(
		{ title: comic.title, bands: comic.bands, pageCount: comic.pages.length },
		comic.pages[index],
		index
	);
}

export function bandsFor(ctx: BandContext, page: Page | undefined, index: number): Bands {
	const fill = (text: string) =>
		text
			.replaceAll('{comic}', ctx.title)
			.replaceAll('{pages}', String(ctx.pageCount))
			.replaceAll('{page}', String(index + 1));
	const header = bandSource(ctx.bands, page, 'header');
	const footer = bandSource(ctx.bands, page, 'footer');
	return {
		header: {
			title: fill(header.title),
			subtitle: fill(header.subtitle)
		},
		footer: {
			left: fill(footer.left),
			center: fill(footer.center),
			right: fill(footer.right),
			qr: fill(footer.qr ?? '')
		}
	};
}

/** Slot-by-slot changes to a band; undefined slots are left alone. */
export type BandsPatch = BandOverrides;

/** Change the comic's defaults, starting from the house bands if it has none yet. */
export function setDefaultBands(comic: Comic, patch: BandsPatch): void {
	const base = comicBands(comic);
	comic.bands = {
		header: { ...HOUSE_BANDS.header, ...base.header, ...defined(patch.header) },
		footer: { ...HOUSE_BANDS.footer, ...base.footer, ...defined(patch.footer) }
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

/** Drop one slot's override, so the page shows the default there again. */
export function clearPageBandSlot(page: Page, band: Band, slot: string): void {
	const next: BandOverrides = { ...page.bands };
	if (!next[band]) return;
	const slots = { ...next[band] } as Record<string, string>;
	delete slots[slot];
	next[band] = slots as never;
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
	if (next.hidden && !next.hidden.length) delete next.hidden;
	if (Object.keys(next).length) page.bands = next;
	else delete page.bands;
}

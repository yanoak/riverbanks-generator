// The web edition: the whole series joined into one comic, so the editor's PDF export prints it
// in one go, with each panel image swapped for a smaller copy (scripts/web-edition.ts).
// Plan: 2026-10-12_web-edition-pdf.

import { fitImage } from '$lib/geometry/image';
import { bandsFor } from '$lib/model/bands';
import { clone } from '$lib/model/clone';
import { createPage, PAGE_FORMATS } from '$lib/model/factory';
import { createFreePanel, splash } from '$lib/model/panels';
import { DOC_VERSION, type Comic, type Id, type Page } from '$lib/model/types';

/** Some pages of a comic, by 0-based index; absent `pages` is all of them. */
export interface Slice {
	comic: Comic;
	pages?: number[];
}

/**
 * One comic holding the pages of `slices`, in order. Each page keeps the band text it showed
 * in its own comic, written out as page overrides with {comic}, {page} and {pages} filled in from
 * that comic, so "Act Two" and its page numbers survive the join. Comics without a style may
 * join any; comics in two different styles are refused.
 */
export function joinComics(id: Id, title: string, slices: Slice[]): Comic {
	const styles = new Set(slices.map((s) => s.comic.styleProfileId).filter(Boolean));
	if (styles.size > 1)
		throw new Error(`The comics use different styles: ${[...styles].join(', ')}`);
	const pages = slices.flatMap(({ comic, pages }) =>
		(pages ?? comic.pages.map((_, i) => i)).map((index) => {
			const source = comic.pages[index];
			if (!source) throw new Error(`${comic.title} has no page ${index + 1}.`);
			const page = clone(source);
			const { header, footer } = bandsFor(
				{ title: comic.title, bands: comic.bands, pageCount: comic.pages.length },
				source,
				index
			);
			const hidden = source.bands?.hidden;
			page.bands = { header, footer, ...(hidden?.length ? { hidden: [...hidden] } : {}) };
			return page;
		})
	);
	const [style] = styles;
	return { id, title, ...(style ? { styleProfileId: style } : {}), pages, docVersion: DOC_VERSION };
}

/**
 * Swap the lines of some lettering for `lines`, keeping its markup: the html must hold exactly
 * one text run per line, as plain multi-line lettering does.
 */
export function relineHtml(html: string, lines: string[]): string {
	const runs = html.match(/>[^<]+</g) ?? [];
	if (runs.length !== lines.length)
		throw new Error(`Expected ${lines.length} lines of lettering, found ${runs.length}: ${html}`);
	let i = 0;
	return html.replace(/>[^<]+</g, () => `>${escapeHtml(lines[i++])}<`);
}

const escapeHtml = (text: string) =>
	text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * A board that is one picture, edge to edge, like the title posters: the grid is a single
 * borderless panel under a full-page free panel holding the image, and both bands are off.
 */
export function imagePage(assetId: Id, naturalWidth: number, naturalHeight: number): Page {
	const { grid, size } = PAGE_FORMATS.board;
	const page = createPage(grid, size);
	splash(page);
	const panel = createFreePanel(page);
	Object.assign(panel, { x: 0, y: 0, w: page.width, h: page.height, border: 'none' });
	const natural = { naturalWidth, naturalHeight };
	panel.image = { assetId, ...natural, ...fitImage(natural, panel, 'fill') };
	page.panels.push(panel);
	page.bands = { hidden: ['header', 'footer'] };
	return page;
}

export interface ImageNeed {
	/** The comic whose folder holds the image. */
	comicId: Id;
	assetId: Id;
	/** The widest it is drawn anywhere, in page units. */
	width: number;
}

/** Every panel image in `comics`, once each, with the widest size it is drawn at. */
export function imageNeeds(comics: { id: Id; comic: Comic }[]): ImageNeed[] {
	const needs = new Map<Id, ImageNeed>();
	for (const { id, comic } of comics)
		for (const page of comic.pages)
			for (const panel of page.panels) {
				const image = panel.image;
				if (!image) continue;
				const width = image.naturalWidth * image.scale;
				const seen = needs.get(image.assetId);
				if (!seen) needs.set(image.assetId, { comicId: id, assetId: image.assetId, width });
				else seen.width = Math.max(seen.width, width);
			}
	return [...needs.values()];
}

/**
 * The pixel width to resize an image to: wide enough for `pxPerUnit` where it is drawn, never
 * wider than the original.
 */
export function targetWidth(need: ImageNeed, naturalWidth: number, pxPerUnit: number): number {
	return Math.min(naturalWidth, Math.ceil(need.width * pxPerUnit));
}

// Human-readable panel references, CODE:page:panel (e.g. TC:2:3), for people and agents to
// name panels by. Positional on purpose: "page 2, panel 3 in reading order" is how the scripts
// already talk, so a ref moves when pages are reordered or panels merged; panel ids stay the
// permanent handle underneath.

import type { Comic, Page, Panel } from './types';

const SMALL = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'in', 'on', 'to', 'at', 'by']);

/** Clean a code to capital letters and digits, at most 8. */
export const cleanCode = (code: string): string =>
	code
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 8);

/** The initials of the title's significant words ("Taming Currents" → TC). */
export function defaultCode(title: string): string {
	const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
	const significant = words.filter((w) => !SMALL.has(w.toLowerCase()));
	if (significant.length >= 2) return cleanCode(significant.map((w) => w[0]).join(''));
	const one = significant[0] ?? words[0];
	return one ? cleanCode(one.slice(0, 3)) : 'C';
}

/** The comic's code: its own, cleaned, else the default from its title. */
export function comicCode(comic: Pick<Comic, 'code' | 'title'>): string {
	return cleanCode(comic.code ?? '') || defaultCode(comic.title);
}

/** Panels in reading order: grid panels by first cell, then free panels bottom to top. */
export function readingOrder(page: Page): Panel[] {
	const grid = page.panels
		.filter((p) => p.kind === 'grid')
		.sort((a, b) => Math.min(...a.cells) - Math.min(...b.cells));
	const free = page.panels.filter((p) => p.kind === 'free').sort((a, b) => a.z - b.z);
	return [...grid, ...free];
}

/** CODE:page:panel for a panel on page `pageIndex` (0-based); '' if it isn't there. */
export function panelRef(comic: Comic, pageIndex: number, panelId: string): string {
	const page = comic.pages[pageIndex];
	const n = page ? readingOrder(page).findIndex((p) => p.id === panelId) : -1;
	return n < 0 ? '' : `${comicCode(comic)}:${pageIndex + 1}:${n + 1}`;
}

const REF = /^([A-Za-z0-9]{1,8}):(\d+):(\d+)$/;

export const isPanelRef = (s: unknown): s is string => typeof s === 'string' && REF.test(s.trim());

/** The page (1-based) and panel id a ref names; throws with a reason a person can act on. */
export function resolvePanelRef(comic: Comic, ref: string): { page: number; panelId: string } {
	const m = REF.exec(ref.trim());
	if (!m) throw new Error(`“${ref}” isn't a panel ref like ${comicCode(comic)}:1:2.`);
	const [, code, pageText, panelText] = m;
	const own = comicCode(comic);
	if (code.toUpperCase() !== own)
		throw new Error(`“${ref}” is for comic ${code.toUpperCase()}; this comic's code is ${own}.`);
	const page = Number(pageText);
	if (page < 1 || page > comic.pages.length)
		throw new Error(`“${ref}”: this comic has ${comic.pages.length} pages.`);
	const panels = readingOrder(comic.pages[page - 1]);
	const n = Number(panelText);
	if (n < 1 || n > panels.length)
		throw new Error(`“${ref}”: page ${page} has ${panels.length} panels.`);
	return { page, panelId: panels[n - 1].id };
}

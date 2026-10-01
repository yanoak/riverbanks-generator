// A comic as plain text: what `fetch` returns to ChatGPT's deep research, and what `search`
// matches against. Balloons live on the page, so each is filed under the panel containing its
// centre (free panels first, since they sit on top).

import { panelOutline } from '$lib/geometry/grid';
import { insidePolygon as inside } from '$lib/geometry/panel';
import type { Balloon, Comic, Page, Panel } from '$lib/model/types';
import { htmlToPlain } from './text';

const plain = (b: Balloon) => htmlToPlain(b.html).replace(/\*+/g, '').replace(/\n+/g, ' / ');

function cellsLabel(cells: number[]): string {
	const sorted = [...cells].sort((a, b) => a - b);
	if (sorted.length === 1) return `cell ${sorted[0]}`;
	const consecutive = sorted.every((c, i) => i === 0 || c === sorted[i - 1] + 1);
	return consecutive ? `cells ${sorted[0]}–${sorted.at(-1)}` : `cells ${sorted.join(', ')}`;
}

/** Panels in reading order: grid panels by first cell, then free panels bottom to top. */
function orderedPanels(page: Page): Panel[] {
	const grid = page.panels
		.filter((p) => p.kind === 'grid')
		.sort((a, b) => Math.min(...a.cells) - Math.min(...b.cells));
	const free = page.panels.filter((p) => p.kind === 'free').sort((a, b) => a.z - b.z);
	return [...grid, ...free];
}

/** Even-odd ray casting; outlines are simple polygons (canMerge rules out holes). */

function panelFor(page: Page, b: Balloon): Panel | null {
	const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
	const free = page.panels
		.filter((p) => p.kind === 'free')
		.sort((a, b2) => b2.z - a.z)
		.find((p) => c.x >= p.x && c.x <= p.x + p.w && c.y >= p.y && c.y <= p.y + p.h);
	if (free) return free;
	// Test against each panel's traced outline, not the cell grid: a merged panel absorbs its
	// internal gutters, which cell lookup would report as "no panel".
	return (
		page.panels.find(
			(p) => p.kind === 'grid' && inside(c, panelOutline(p.cells, page.grid, page))
		) ?? null
	);
}

export function comicScript(comic: Comic, meta: { id: string; appUrl: string }): string {
	const lines: string[] = [comic.title, ''];
	comic.pages.forEach((page, i) => {
		const n = i + 1;
		lines.push(
			`Page ${n} (${page.grid.rows}×${page.grid.cols} grid) ${meta.appUrl}/comics/${meta.id}?page=${n}`
		);
		const byPanel = new Map<Panel | null, Balloon[]>();
		for (const b of [...page.balloons].sort((a, c) => a.y - c.y || a.x - c.x)) {
			const panel = panelFor(page, b);
			byPanel.set(panel, [...(byPanel.get(panel) ?? []), b]);
		}
		orderedPanels(page).forEach((panel, j) => {
			const label = panel.kind === 'grid' ? cellsLabel(panel.cells) : 'free panel';
			const balloons = byPanel.get(panel) ?? [];
			const image = panel.image ? ' [image]' : '';
			if (!balloons.length) {
				lines.push(
					`  Panel ${j + 1} (${label})${image}: ${panel.image ? '(image only)' : '(empty)'}`
				);
				return;
			}
			lines.push(`  Panel ${j + 1} (${label})${image}:`);
			for (const b of balloons) lines.push(`    ${b.type}: ${plain(b)}`);
		});
		const loose = byPanel.get(null) ?? [];
		if (loose.length) {
			lines.push('  Across the page:');
			for (const b of loose) lines.push(`    ${b.type}: ${plain(b)}`);
		}
		lines.push('');
	});
	return lines.join('\n').trimEnd();
}

/** Does the comic match `query` (title or balloon text)? Returns the first matching page. */
export function searchComic(comic: Comic, query: string): { page: number } | null {
	const q = query.trim().toLowerCase();
	if (!q) return null;
	if (comic.title.toLowerCase().includes(q)) return { page: 1 };
	const i = comic.pages.findIndex((page) =>
		page.balloons.some((b) => plain(b).toLowerCase().includes(q))
	);
	return i === -1 ? null : { page: i + 1 };
}

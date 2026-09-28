// The comic as a Y.Doc, the source of truth once several people edit at once. The rest of the
// app keeps working with the plain `Comic` shape: projectComic() derives it, and applyComic()
// writes an edited draft back as the smallest set of Y changes, addressed by id, so edits made
// concurrently by different people touch different keys and merge.
//
//   comic: Y.Map        id, title, docVersion, pages
//     pages: Y.Map<pageId, Y.Map>     order is a number per page (midpoints on insert/move)
//       id, width, height, order
//       grid: Y.Map                   rows, cols, gutter, margin
//       cells: Y.Map<"r,c", panelId>  grid ownership: one entry per cell, see derivePanels
//       panels: Y.Map<id, Y.Map>      every Panel field except cells
//       balloons: Y.Map<id, Y.Map>    every Balloon field except html; text: Y.XmlFragment

import * as Y from 'yjs';
import { derivePanels } from '$lib/geometry/grid';
import { clone } from './clone';
import { fragmentToHtml, htmlToFragment } from './text';
import {
	DOC_VERSION,
	type Balloon,
	type Comic,
	type FreePanel,
	type GridPanel,
	type GridSpec,
	type Page,
	type Panel
} from './types';

type YMap = Y.Map<unknown>;

/** Transaction origins. Undo tracks LOCAL (and the text editor's own sync origin) only. */
export const LOCAL = 'local';
export const LOAD = 'load';

const map = (m: YMap, key: string) => m.get(key) as YMap;
const rootOf = (doc: Y.Doc) => doc.getMap('comic');
const pagesOf = (doc: Y.Doc) => map(rootOf(doc), 'pages');

const key = (cell: number, cols: number) => `${Math.floor(cell / cols)},${cell % cols}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Set each field that differs; delete fields the draft dropped. */
function patch(target: YMap, before: object, after: object, skip: string[] = []) {
	const b = before as Record<string, unknown>;
	const a = after as Record<string, unknown>;
	for (const [k, v] of Object.entries(a)) {
		if (skip.includes(k) || v === undefined || same(b[k], v)) continue;
		target.set(k, clone(v));
	}
	for (const k of Object.keys(b)) {
		if (!skip.includes(k) && a[k] === undefined && b[k] !== undefined) target.delete(k);
	}
}

/** Insert a new Y.Map under `parent[id]` and fill it (types must be integrated first). */
function child(parent: YMap, id: string): YMap {
	parent.set(id, new Y.Map());
	return map(parent, id);
}

// --- writing -------------------------------------------------------------------------------

function writeBalloon(balloons: YMap, b: Balloon) {
	const m = child(balloons, b.id);
	patch(m, {}, b, ['html']);
	m.set('text', new Y.XmlFragment());
	htmlToFragment(b.html, m.get('text') as Y.XmlFragment);
}

function writePanel(panels: YMap, p: Panel) {
	patch(child(panels, p.id), {}, p, ['cells']);
}

function writePage(pages: YMap, page: Page) {
	const m = child(pages, page.id);
	m.set('id', page.id);
	m.set('width', page.width);
	m.set('height', page.height);
	patch(child(m, 'grid'), {}, page.grid);
	const cells = child(m, 'cells');
	const panels = child(m, 'panels');
	const balloons = child(m, 'balloons');
	for (const p of page.panels) {
		writePanel(panels, p);
		if (p.kind === 'grid') for (const c of p.cells) cells.set(key(c, page.grid.cols), p.id);
	}
	for (const b of page.balloons) writeBalloon(balloons, b);
}

/** A new Y.Doc (or `doc`, emptied of nothing: it should be fresh) holding the comic. */
export function comicToYDoc(comic: Comic, doc = new Y.Doc()): Y.Doc {
	doc.transact(() => {
		const root = rootOf(doc);
		root.set('id', comic.id);
		root.set('title', comic.title);
		root.set('docVersion', DOC_VERSION);
		const pages = child(root, 'pages');
		comic.pages.forEach((page, i) => {
			writePage(pages, page);
			map(pages, page.id).set('order', i + 1);
		});
	}, LOAD);
	return doc;
}

/** cell key → owner, for a projected page. */
function owners(page: Page): Map<string, string> {
	const out = new Map<string, string>();
	for (const p of page.panels)
		if (p.kind === 'grid') for (const c of p.cells) out.set(key(c, page.grid.cols), p.id);
	return out;
}

function diffPage(m: YMap, before: Page, after: Page) {
	patch(m, before, after, ['id', 'grid', 'panels', 'balloons']);
	patch(map(m, 'grid'), before.grid, after.grid);

	const cells = map(m, 'cells');
	const was = owners(before);
	const now = owners(after);
	for (const [k, id] of now) if (was.get(k) !== id) cells.set(k, id);
	for (const k of was.keys()) if (!now.has(k)) cells.delete(k);

	const panels = map(m, 'panels');
	const oldPanels = new Map(before.panels.map((p) => [p.id, p]));
	for (const p of before.panels) {
		if (!after.panels.some((q) => q.id === p.id) && panels.has(p.id)) panels.delete(p.id);
	}
	for (const p of after.panels) {
		const old = oldPanels.get(p.id);
		const stored = panels.get(p.id) as YMap | undefined;
		if (stored) {
			patch(stored, old ?? {}, p, ['cells']);
			continue;
		}
		// Not stored: new, or a derived piece (see derivePanels). An unchanged derived piece
		// stays derived; one that changed is written back under its (deterministic) id.
		if (old && same(old, p)) continue;
		writePanel(panels, p);
		if (p.kind === 'grid') for (const c of p.cells) cells.set(key(c, after.grid.cols), p.id);
	}

	const balloons = map(m, 'balloons');
	const oldBalloons = new Map(before.balloons.map((b) => [b.id, b]));
	for (const b of before.balloons) {
		if (!after.balloons.some((q) => q.id === b.id)) balloons.delete(b.id);
	}
	for (const b of after.balloons) {
		const old = oldBalloons.get(b.id);
		const stored = balloons.get(b.id) as YMap | undefined;
		if (!old || !stored) {
			writeBalloon(balloons, b);
			continue;
		}
		patch(stored, old, b, ['html', 'text']);
		if (old.html !== b.html) htmlToFragment(b.html, stored.get('text') as Y.XmlFragment);
	}
}

/**
 * Give pages order numbers matching `ids`, touching as few as possible: the longest run of
 * pages already in increasing order keeps its numbers, and the rest get midpoints.
 */
function reorder(pages: YMap, ids: string[]) {
	const orders = ids.map((id) => map(pages, id).get('order') as number | undefined);
	// Longest strictly increasing subsequence of the existing orders (O(n²); n is page count).
	const len = orders.map(() => 1);
	const prev = orders.map(() => -1);
	for (let i = 0; i < orders.length; i++) {
		for (let j = 0; j < i; j++) {
			const oi = orders[i];
			const oj = orders[j];
			if (oi !== undefined && oj !== undefined && oj < oi && len[j] + 1 > len[i]) {
				len[i] = len[j] + 1;
				prev[i] = j;
			}
		}
	}
	const keep = new Set<number>();
	let best = -1;
	orders.forEach((o, i) => {
		if (o !== undefined && (best < 0 || len[i] > len[best])) best = i;
	});
	for (let i = best; i >= 0; i = prev[i]) keep.add(i);

	let lower: number | undefined;
	ids.forEach((id, i) => {
		if (keep.has(i)) {
			lower = orders[i];
			return;
		}
		const nextKept = [...keep].filter((k) => k > i).sort((a, b) => a - b)[0];
		const upper = nextKept === undefined ? undefined : orders[nextKept];
		const value =
			lower === undefined
				? upper === undefined
					? 1
					: upper - 1
				: upper === undefined
					? lower + 1
					: (lower + upper) / 2;
		map(pages, id).set('order', value);
		lower = value;
	});
}

/**
 * Write the differences between `before` (a projection of this doc) and `after` (an edited
 * copy of it) as one transaction. Only changed keys are written.
 */
export function applyComic(doc: Y.Doc, before: Comic, after: Comic, origin: unknown = LOCAL) {
	doc.transact(() => {
		const root = rootOf(doc);
		if (before.title !== after.title) root.set('title', after.title);
		const pages = pagesOf(doc);
		const old = new Map(before.pages.map((p) => [p.id, p]));
		for (const p of before.pages) {
			if (!after.pages.some((q) => q.id === p.id)) pages.delete(p.id);
		}
		for (const p of after.pages) {
			const was = old.get(p.id);
			const stored = pages.get(p.id) as YMap | undefined;
			if (was && stored) diffPage(stored, was, p);
			else writePage(pages, p);
		}
		const beforeIds = before.pages.map((p) => p.id);
		const afterIds = after.pages.map((p) => p.id);
		if (!same(beforeIds, afterIds)) reorder(pages, afterIds);
	}, origin);
}

// --- reading -------------------------------------------------------------------------------

const htmlCache = new WeakMap<Y.XmlFragment, string>();
const watched = new WeakSet<Y.Doc>();

/** Drop cached HTML for any fragment a transaction touched. */
function watch(doc: Y.Doc) {
	if (watched.has(doc)) return;
	watched.add(doc);
	doc.on('afterTransaction', (tr: Y.Transaction) => {
		for (const type of tr.changedParentTypes.keys()) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (let t: Y.AbstractType<any> | null = type; t; t = t.parent) {
				if (t instanceof Y.XmlFragment && !(t instanceof Y.XmlElement)) htmlCache.delete(t);
			}
		}
	});
}

function htmlOf(fragment: Y.XmlFragment): string {
	let html = htmlCache.get(fragment);
	if (html === undefined) {
		html = fragmentToHtml(fragment);
		htmlCache.set(fragment, html);
	}
	return html;
}

const DEFAULT_STYLE = { border: 'solid', fill: '#ffffff' } as const;

function projectPage(m: YMap): Page {
	const grid = map(m, 'grid').toJSON() as GridSpec;
	const cells = map(m, 'cells');
	const panels = map(m, 'panels');
	const balloons = map(m, 'balloons');
	const stored = (id: string) => panels.get(id) as YMap | undefined;

	const used = new Set<string>();
	const unique = (id: string) => {
		while (used.has(id)) id += '+';
		used.add(id);
		return id;
	};

	const grids: GridPanel[] = derivePanels(
		grid,
		(cell) => cells.get(key(cell, grid.cols)) as string | undefined,
		(id) => stored(id)?.get('kind') === 'grid'
	).map((d) => {
		const source = d.source ? (stored(d.source)!.toJSON() as GridPanel) : undefined;
		const panel: GridPanel = {
			...(source ?? DEFAULT_STYLE),
			id: unique(d.id),
			kind: 'grid',
			cells: d.cells
		};
		// Only the piece that kept the id keeps the image.
		if (d.derived) delete panel.image;
		return panel;
	});

	const frees = [...panels.values()]
		.map((p) => (p as YMap).toJSON() as FreePanel)
		.filter((p) => p.kind === 'free')
		.sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
	for (const p of frees) used.add(p.id);

	const texts = [...balloons.values()]
		.map((b) => {
			const bm = b as YMap;
			const fields = bm.toJSON();
			delete fields.text;
			return { ...fields, html: htmlOf(bm.get('text') as Y.XmlFragment) } as Balloon;
		})
		.sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));

	return {
		id: m.get('id') as string,
		width: m.get('width') as number,
		height: m.get('height') as number,
		grid,
		panels: [...grids, ...frees],
		balloons: texts
	};
}

/** The comic as plain data, with grid panels derived from cell ownership. */
export function projectComic(doc: Y.Doc): Comic {
	watch(doc);
	const root = rootOf(doc);
	const pages = [...pagesOf(doc).values()]
		.map((p) => p as YMap)
		.sort(
			(a, b) =>
				(a.get('order') as number) - (b.get('order') as number) ||
				String(a.get('id')).localeCompare(String(b.get('id')))
		)
		.map(projectPage);
	return {
		id: root.get('id') as string,
		title: root.get('title') as string,
		pages,
		docVersion: DOC_VERSION
	};
}

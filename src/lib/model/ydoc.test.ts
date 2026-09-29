import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createComic, createPage } from './factory';
import { createBalloon } from './balloons';
import { checkPage, gridPanels } from './invariants';
import { mergePanels, setGrid, splitPanel } from './panels';
import type { Comic, FreePanel, Page } from './types';
import { applyComic, comicToYDoc, projectComic } from './ydoc';
import { clone } from './clone';

/** A comic that uses every feature: merges (incl. an L), free panels, images, tails, rich text. */
function fixture(): Comic {
	const comic = createComic('Fixture');
	const page = comic.pages[0];
	const [p0, p1, , , p4, p5] = gridPanels(page);
	expect(mergePanels(page, [p0.id, p1.id, p5.id]).ok).toBe(true); // L-shape 0,1,5
	page.panels.find((p) => p.id === p4.id)!.image = {
		assetId: 'img-1',
		naturalWidth: 800,
		naturalHeight: 600,
		offsetX: -10,
		offsetY: 5,
		scale: 1.25
	};
	page.panels.push({
		id: 'free-1',
		kind: 'free',
		x: 100,
		y: 200,
		w: 300,
		h: 150,
		z: 2,
		border: 'none',
		fill: '#eeeeee'
	} satisfies FreePanel);
	const speech = createBalloon(page, 'speech');
	speech.html = '<p style="text-align: left;">Hi <strong>there</strong><br>you</p>';
	comic.styleProfileId = 'style-1';
	page.panels.find((p) => p.id === p4.id)!.prompt = 'Mae on the raft at dawn';
	const caption = createBalloon(page, 'caption');
	caption.clipTo = p4.id;
	page.balloons.push(speech, caption);
	comic.pages.push(createPage({ rows: 2, cols: 2 }));
	return comic;
}

/** Canonical form for comparison: TipTap spells out the default alignment. */
const canon = (comic: Comic) =>
	JSON.parse(JSON.stringify(comic).replaceAll(' style=\\"text-align: center;\\"', ''));

/** Two replicas that exchange updates only when told to. */
function replicas(comic: Comic) {
	const a = comicToYDoc(comic);
	const b = new Y.Doc();
	// Concurrent writes to one key resolve to the higher client id: make B win, deterministically.
	b.clientID = 0xfffffffe;
	Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
	const sync = () => {
		const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
		const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
		Y.applyUpdate(b, ua);
		Y.applyUpdate(a, ub);
	};
	return { a, b, sync };
}

/** Run a draft edit against a replica, the way the editor and MCP do. */
function edit(doc: Y.Doc, change: (draft: Comic) => void) {
	const prev = projectComic(doc);
	const next = clone(prev);
	change(next);
	applyComic(doc, prev, next);
}

const page0 = (c: Comic) => c.pages[0];
const cellsOf = (page: Page) =>
	gridPanels(page)
		.map((p) => p.cells.join(','))
		.sort();

describe('comicToYDoc / projectComic', () => {
	it('round-trips a comic that uses every feature', () => {
		const comic = fixture();
		expect(canon(projectComic(comicToYDoc(comic)))).toEqual(canon(orderedLikeProjection(comic)));
	});

	it('round-trips a freshly created comic', () => {
		const comic = createComic('New');
		expect(canon(projectComic(comicToYDoc(comic)))).toEqual(canon(orderedLikeProjection(comic)));
	});
});

/** The projection's orders: grid panels by first cell, then free by z; balloons by z. */
function orderedLikeProjection(comic: Comic): Comic {
	const c = clone(comic);
	for (const p of c.pages) {
		const grid = gridPanels(p).sort((x, y) => x.cells[0] - y.cells[0]);
		const free = p.panels.filter((x) => x.kind === 'free').sort((x, y) => x.z - y.z);
		p.panels = [...grid, ...free];
		p.balloons.sort((x, y) => x.z - y.z || x.id.localeCompare(y.id));
	}
	return c;
}

describe('style and prompts', () => {
	it('sets, changes and clears the comic’s style and a panel’s prompt', () => {
		const doc = comicToYDoc(createComic('Styled'));
		const panelId = () => projectComic(doc).pages[0].panels[0].id;
		edit(doc, (d) => {
			d.styleProfileId = 'style-1';
			d.pages[0].panels[0].prompt = 'a raft';
		});
		expect(projectComic(doc).styleProfileId).toBe('style-1');
		expect(projectComic(doc).pages[0].panels[0].prompt).toBe('a raft');
		edit(doc, (d) => (d.styleProfileId = 'style-2'));
		expect(projectComic(doc).styleProfileId).toBe('style-2');
		edit(doc, (d) => {
			delete d.styleProfileId;
			delete d.pages[0].panels[0].prompt;
		});
		expect(projectComic(doc)).not.toHaveProperty('styleProfileId');
		expect(projectComic(doc).pages[0].panels.find((p) => p.id === panelId())).not.toHaveProperty(
			'prompt'
		);
	});

	it('a comic from before styles projects without them', () => {
		const comic = createComic('Old');
		const projected = projectComic(comicToYDoc(comic));
		expect(projected).not.toHaveProperty('styleProfileId');
		expect(projected.pages[0].panels.every((p) => !('prompt' in p))).toBe(true);
	});

	it('only the piece of a split that keeps the id keeps the prompt, like the image', () => {
		const doc = comicToYDoc(createComic('Split'));
		const ids = gridPanels(projectComic(doc).pages[0]).map((p) => p.id);
		edit(doc, (d) => {
			mergePanels(page0(d), [ids[0], ids[1]]);
			page0(d).panels.find((p) => p.id === ids[0])!.prompt = 'wide shot';
		});
		edit(doc, (d) => splitPanel(page0(d), ids[0]));
		const prompts = projectComic(doc).pages[0].panels.filter((p) => p.prompt);
		expect(prompts.map((p) => p.id)).toEqual([ids[0]]);
	});
});

describe('applyComic', () => {
	it('writes nothing when nothing changed', () => {
		const doc = comicToYDoc(fixture());
		let updates = 0;
		doc.on('update', () => updates++);
		edit(doc, () => {});
		expect(updates).toBe(0);
	});

	it('applies field, insert, delete and reorder edits', () => {
		const doc = comicToYDoc(fixture());
		edit(doc, (d) => {
			d.title = 'Renamed';
			const b = page0(d).balloons[0];
			b.x += 50;
			b.html = '<p>changed</p>';
			delete b.tail;
			page0(d).balloons.splice(1, 1);
			d.pages.unshift(createPage());
		});
		const out = projectComic(doc);
		expect(out.title).toBe('Renamed');
		expect(out.pages).toHaveLength(3);
		expect(out.pages[1].balloons).toHaveLength(1);
		expect(out.pages[1].balloons[0].html).toContain('changed');
		expect(out.pages[1].balloons[0].tail).toBeUndefined();
	});

	it('moves pages', () => {
		const doc = comicToYDoc(fixture());
		edit(doc, (d) => d.pages.push(createPage(), createPage()));
		const ids = projectComic(doc).pages.map((p) => p.id);
		edit(doc, (d) => d.pages.splice(3, 0, ...d.pages.splice(0, 1)));
		expect(projectComic(doc).pages.map((p) => p.id)).toEqual([ids[1], ids[2], ids[3], ids[0]]);
		edit(doc, (d) => d.pages.unshift(d.pages.pop()!));
		expect(projectComic(doc).pages.map((p) => p.id)).toEqual(ids);
	});

	it('merge writes only the cells that change owner', () => {
		const doc = comicToYDoc(createComic());
		const before = Y.encodeStateVector(doc);
		edit(doc, (d) => {
			const [x, y] = gridPanels(page0(d));
			mergePanels(page0(d), [x.id, y.id]);
		});
		const delta = Y.decodeUpdate(Y.encodeStateAsUpdate(doc, before));
		// One cell owner and the dropped panel; nothing else on the page.
		expect(delta.structs.length).toBeLessThanOrEqual(2);
		expect(cellsOf(page0(projectComic(doc)))[0]).toBe('0,1');
	});

	it('changes the grid shape', () => {
		const doc = comicToYDoc(createComic());
		edit(doc, (d) => expect(setGrid(page0(d), { rows: 2, cols: 2 }).ok).toBe(true));
		const page = page0(projectComic(doc));
		expect(page.grid).toMatchObject({ rows: 2, cols: 2 });
		expect(gridPanels(page)).toHaveLength(4);
		expect(checkPage(page)).toEqual([]);
	});

	it('writes back a derived panel under its derived id', () => {
		const { a, b, sync } = replicas(createComic());
		// A merges cells 0,1,2 into P; B concurrently merges cell 1 with 5 (and wins cell 1),
		// so P is left owning 0 and 2, which are not connected.
		const ids = gridPanels(page0(projectComic(a))).map((p) => p.id);
		edit(a, (d) => mergePanels(page0(d), [ids[0], ids[1], ids[2]]));
		edit(b, (d) => mergePanels(page0(d), [ids[5], ids[1]]));
		sync();
		const page = page0(projectComic(a));
		expect(checkPage(page)).toEqual([]);
		const derived = gridPanels(page).find((p) => p.id.includes('~'));
		expect(derived).toMatchObject({ id: `${ids[0]}~0,2`, cells: [2] });
		// B styles the derived piece; A sees it under the same id, now stored for real.
		edit(b, (d) => (gridPanels(page0(d)).find((p) => p.id === derived!.id)!.fill = '#ff0000'));
		sync();
		const again = gridPanels(page0(projectComic(a))).find((p) => p.id === derived!.id);
		expect(again).toMatchObject({ fill: '#ff0000', cells: [2] });
		expect(projectComic(a)).toEqual(projectComic(b));
	});
});

describe('concurrent edits converge to a valid page', () => {
	const converge = (a: Y.Doc, b: Y.Doc) => {
		const pa = projectComic(a);
		const pb = projectComic(b);
		expect(pa).toEqual(pb);
		for (const page of pa.pages) expect(checkPage(page)).toEqual([]);
		return pa;
	};

	it('overlapping merges', () => {
		const { a, b, sync } = replicas(createComic());
		const ids = gridPanels(page0(projectComic(a))).map((p) => p.id);
		edit(a, (d) => mergePanels(page0(d), [ids[0], ids[1], ids[4], ids[5]]));
		edit(b, (d) => mergePanels(page0(d), [ids[1], ids[2], ids[5], ids[6]]));
		sync();
		const page = page0(converge(a, b));
		expect(
			gridPanels(page)
				.flatMap((p) => p.cells)
				.sort((x, y) => x - y)
		).toEqual([...Array(12).keys()]);
	});

	it('merge against split of the same panel', () => {
		const { a, b, sync } = replicas(createComic());
		const ids = gridPanels(page0(projectComic(a))).map((p) => p.id);
		edit(a, (d) => mergePanels(page0(d), [ids[0], ids[1], ids[2]]));
		sync();
		edit(a, (d) => splitPanel(page0(d), ids[0]));
		edit(b, (d) => mergePanels(page0(d), [ids[0], ids[3]]));
		sync();
		converge(a, b);
	});

	it('grid reshape against a merge', () => {
		const { a, b, sync } = replicas(createComic());
		const ids = gridPanels(page0(projectComic(a))).map((p) => p.id);
		edit(a, (d) => setGrid(page0(d), { rows: 2, cols: 3 }));
		edit(b, (d) => mergePanels(page0(d), [ids[0], ids[1]]));
		sync();
		converge(a, b);
	});

	it('moving one balloon and deleting another both apply', () => {
		const comic = fixture();
		const [s, c] = comic.pages[0].balloons.map((x) => x.id);
		const { a, b, sync } = replicas(comic);
		edit(a, (d) => (page0(d).balloons.find((x) => x.id === s)!.x = 5));
		edit(b, (d) => (page0(d).balloons = page0(d).balloons.filter((x) => x.id !== c)));
		sync();
		const out = converge(a, b);
		expect(page0(out).balloons.map((x) => [x.id, x.x])).toEqual([[s, 5]]);
	});

	it('different fields of one balloon both survive; the same field agrees', () => {
		const comic = fixture();
		const id = comic.pages[0].balloons[0].id;
		const { a, b, sync } = replicas(comic);
		const bal = (d: Comic) => page0(d).balloons.find((x) => x.id === id)!;
		edit(a, (d) => ((bal(d).x = 11), (bal(d).fill = '#aaaaaa')));
		edit(b, (d) => ((bal(d).y = 22), (bal(d).fill = '#bbbbbb')));
		sync();
		const out = bal(converge(a, b));
		expect([out.x, out.y]).toEqual([11, 22]);
		expect(['#aaaaaa', '#bbbbbb']).toContain(out.fill);
	});

	it('deleting a page while the other side edits a balloon on it', () => {
		const comic = fixture();
		comic.pages.reverse();
		const { a, b, sync } = replicas(comic);
		const target = projectComic(a).pages[1];
		edit(a, (d) => d.pages.splice(1, 1));
		edit(b, (d) => (d.pages[1].balloons[0].x = 1));
		sync();
		const out = converge(a, b);
		expect(out.pages.map((p) => p.id)).not.toContain(target.id);
	});

	it('both inserting a page at the same spot keeps both', () => {
		const { a, b, sync } = replicas(createComic());
		edit(a, (d) => d.pages.push(createPage()));
		edit(b, (d) => d.pages.push(createPage()));
		sync();
		expect(converge(a, b).pages).toHaveLength(3);
	});
});

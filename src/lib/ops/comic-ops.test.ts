import { describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import { checkPage, gridPanels } from '$lib/model/invariants';
import {
	addBalloon,
	addFreePanel,
	addPage,
	deleteBalloon,
	deletePage,
	mergePanels,
	movePage,
	removePanelImage,
	setBands,
	setPage,
	setGrid,
	setPanelImage,
	splitPanel,
	updateBalloon,
	updatePanel
} from './comic-ops';

describe('setPage', () => {
	it('sets and clears a page background, and refuses anything but #rrggbb', () => {
		const comic = createComic('Titles', 'board');
		expect(setPage(comic, { page: 1, background: '#6b7866' })).toMatch(/#6b7866/);
		expect(comic.pages[0].background).toBe('#6b7866');
		setPage(comic, { page: 1, background: null });
		expect(comic.pages[0]).not.toHaveProperty('background');
		expect(() => setPage(comic, { page: 1, background: 'green' })).toThrow(/colour/);
	});
});

describe('title lettering', () => {
	it('letters ==accent== words and sets the accent colour, on titles only', () => {
		const comic = createComic('Titles', 'board');
		const { id } = addBalloon(comic, { page: 1, type: 'title', text: '==IF== WE HAD' });
		const t = comic.pages[0].balloons.find((b) => b.id === id)!;
		expect(t.html).toBe('<p><mark>IF</mark> WE HAD</p>');
		updateBalloon(comic, { page: 1, balloonId: id, fill: '#000000', accent: '#ff0000' });
		expect(t).toMatchObject({ fill: '#000000', stroke: '#ff0000' });
		const speech = addBalloon(comic, { page: 1, type: 'speech', text: 'Hi' }).id;
		expect(() => updateBalloon(comic, { page: 1, balloonId: speech, accent: '#ff0000' })).toThrow(
			/title/
		);
	});
});

describe('page ops', () => {
	it('adds after a given page (default: at the end), deletes (never the last) and moves', () => {
		const comic = createComic();
		addPage(comic, {});
		addPage(comic, { after: 1 });
		expect(comic.pages).toHaveLength(3);
		const third = comic.pages[2].id;
		movePage(comic, { page: 3, to: 1 });
		expect(comic.pages[0].id).toBe(third);
		deletePage(comic, { page: 1 });
		deletePage(comic, { page: 1 });
		expect(() => deletePage(comic, { page: 1 })).toThrow(/last page/);
	});

	it('changes the grid only while nothing is merged', () => {
		const comic = createComic();
		setGrid(comic, { page: 1, rows: 4, cols: 3, gutter: 20 });
		expect(comic.pages[0].grid).toMatchObject({ rows: 4, cols: 3, gutter: 20 });
		mergePanels(comic, { page: 1, cells: [0, 1] });
		expect(() => setGrid(comic, { page: 1, rows: 2 })).toThrow(/Split merged panels/);
	});
});

describe('panel ops', () => {
	it('splits a merged panel back into cells', () => {
		const comic = createComic();
		mergePanels(comic, { page: 1, cells: [0, 1, 4, 5] });
		const merged = gridPanels(comic.pages[0]).find((p) => p.cells.length === 4)!;
		expect(splitPanel(comic, { page: 1, panelId: merged.id })).toMatch(/4 panels/);
		expect(checkPage(comic.pages[0])).toEqual([]);
	});

	it('adds a free panel with an explicit rect and updates panel style', () => {
		const comic = createComic();
		const { id } = addFreePanel(comic, { page: 1, rect: { x: 100, y: 200, w: 300, h: 150 } });
		const free = comic.pages[0].panels.find((p) => p.id === id)!;
		expect(free).toMatchObject({ kind: 'free', x: 100, y: 200, w: 300, h: 150 });
		updatePanel(comic, { page: 1, panelId: id, border: 'none', fill: '#000000' });
		expect(free).toMatchObject({ border: 'none', fill: '#000000' });
		const grid = comic.pages[0].panels[0];
		expect(() =>
			updatePanel(comic, { page: 1, panelId: grid.id, rect: { x: 0, y: 0, w: 1, h: 1 } })
		).toThrow(/only free panels/i);
	});

	it('places and removes an image, filling the panel', () => {
		const comic = createComic();
		const panel = comic.pages[0].panels[0];
		setPanelImage(comic, {
			page: 1,
			panelId: panel.id,
			image: { assetId: 'a', naturalWidth: 1000, naturalHeight: 500 }
		});
		expect(panel.image?.assetId).toBe('a');
		expect(panel.image!.scale).toBeGreaterThan(0);
		removePanelImage(comic, { page: 1, panelId: panel.id });
		expect(panel.image).toBeUndefined();
	});

	it('names the unknown panel id', () => {
		expect(() => splitPanel(createComic(), { page: 1, panelId: 'zzz' })).toThrow(/zzz/);
	});
});

describe('balloon ops', () => {
	it('adds a balloon in a panel with markdown text, edits and deletes it', () => {
		const comic = createComic();
		const panel = comic.pages[0].panels[5];
		const { id } = addBalloon(comic, {
			page: 1,
			type: 'speech',
			text: 'HI **THERE**',
			panelId: panel.id
		});
		const b = comic.pages[0].balloons.find((x) => x.id === id)!;
		expect(b.html).toBe('<p>HI <strong>THERE</strong></p>');
		expect(b.x).toBeGreaterThan(0);

		updateBalloon(comic, {
			page: 1,
			balloonId: id,
			text: 'BYE',
			type: 'shout',
			tailTip: { x: b.x + 10, y: b.y + b.h + 100 },
			fontSize: 40
		});
		expect(b).toMatchObject({ html: '<p>BYE</p>', type: 'shout', fontSize: 40 });
		expect(b.tail).toEqual({ x: 10, y: b.h + 100 });

		deleteBalloon(comic, { page: 1, balloonId: id });
		expect(comic.pages[0].balloons).toHaveLength(0);
	});

	it('points and tilts a caption, clears both, and refuses them where they mean nothing', () => {
		const comic = createComic();
		const { id } = addBalloon(comic, {
			page: 1,
			type: 'caption',
			text: 'THE GREAT PLURIVERSALIZATION',
			point: 'left',
			rotation: -8
		});
		const b = comic.pages[0].balloons.find((x) => x.id === id)!;
		expect(b).toMatchObject({ point: 'left', rotation: -8 });
		updateBalloon(comic, { page: 1, balloonId: id, point: 'right' });
		expect(b.point).toBe('right');
		updateBalloon(comic, { page: 1, balloonId: id, point: null, rotation: null });
		expect(b.point).toBeUndefined();
		expect(b.rotation).toBeUndefined();

		const speech = addBalloon(comic, { page: 1, type: 'speech', text: 'Hi' }).id;
		expect(() => updateBalloon(comic, { page: 1, balloonId: speech, point: 'left' })).toThrow(
			/caption/
		);
		expect(() => updateBalloon(comic, { page: 1, balloonId: speech, rotation: 5 })).toThrow(
			/sfx and caption/
		);
	});

	it('sets a balloon’s own font, and an empty font hands it back to the style', () => {
		const comic = createComic();
		const { id } = addBalloon(comic, { page: 1, type: 'speech', text: 'x' });
		const b = comic.pages[0].balloons.find((x) => x.id === id)!;
		expect(b.font).toBeUndefined();
		updateBalloon(comic, { page: 1, balloonId: id, font: "'Rubik Dirt', sans-serif" });
		expect(b.font).toBe("'Rubik Dirt', sans-serif");
		updateBalloon(comic, { page: 1, balloonId: id, font: '' });
		expect(b).not.toHaveProperty('font');
	});

	it('clears the tail for types that have none', () => {
		const comic = createComic();
		const { id } = addBalloon(comic, { page: 1, type: 'speech', text: 'x' });
		updateBalloon(comic, { page: 1, balloonId: id, type: 'caption' });
		expect(comic.pages[0].balloons[0].tail).toBeUndefined();
	});
});

describe('board pages and bands', () => {
	it('adds a page shaped like the one it follows', () => {
		const comic = createComic('Boards', 'board');
		addPage(comic, {});
		expect(comic.pages[1]).toMatchObject({ width: 1000, height: 1416 });
		expect(comic.pages[1].grid).toEqual(comic.pages[0].grid);
		const old = createComic('Old');
		addPage(old, {});
		expect(old.pages[1]).toMatchObject({ width: 1000, height: 1545 });
		expect(old.pages[1].grid.top).toBeUndefined();
	});

	it('sets the comic’s default bands, a page’s overrides, and resets them', () => {
		const comic = createComic('Taming Currents', 'board');
		addPage(comic, {});
		expect(setBands(comic, { header: { title: 'ACT TWO' } })).toMatch(/every page/i);
		expect(comic.bands?.header.title).toBe('ACT TWO');
		expect(setBands(comic, { page: 2, header: { subtitle: 'The Invitation' } })).toMatch(
			/ACT TWO \/ The Invitation/
		);
		expect(comic.pages[1].bands).toEqual({ header: { subtitle: 'The Invitation' } });
		setBands(comic, { page: 2, reset: true });
		expect(comic.pages[1]).not.toHaveProperty('bands');
	});

	it('turns a page’s bands off and on', () => {
		const comic = createComic('Taming Currents', 'board');
		addPage(comic, {});
		expect(setBands(comic, { page: 2, show: { footer: false } })).toMatch(/footer \(off\)/);
		expect(comic.pages[1].bands).toEqual({ hidden: ['footer'] });
		expect(comic.pages[0].bands).toBeUndefined();
		setBands(comic, { page: 2, show: { footer: true } });
		expect(comic.pages[1]).not.toHaveProperty('bands');
		expect(() => setBands(comic, { show: { header: false } })).toThrow(/page/);
	});

	it('refuses bands on a page without them', () => {
		const comic = createComic('Old');
		expect(() => setBands(comic, { page: 1, header: { title: 'x' } })).toThrow(/no header/);
	});
});

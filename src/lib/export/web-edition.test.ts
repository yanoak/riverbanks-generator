import { describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import type { Comic } from '$lib/model/types';
import { checkPage } from '$lib/model/invariants';
import { imageNeeds, imagePage, joinComics, relineHtml, targetWidth } from './web-edition';

function act(title: string, pages: number, header: string): Comic {
	const comic = createComic(title, 'board');
	while (comic.pages.length < pages) comic.pages.push(structuredClone(comic.pages[0]));
	comic.styleProfileId = 'house';
	comic.bands = {
		header: { title: header, subtitle: '{comic}' },
		footer: { left: '', center: '{page} / {pages}', right: '' }
	};
	return comic;
}

describe('joinComics', () => {
	it('keeps every page in order', () => {
		const joined = joinComics('web', 'Riverbanks', [
			{ comic: act('One', 2, 'ACT ONE') },
			{ comic: act('Two', 3, 'ACT TWO') }
		]);
		expect(joined.pages).toHaveLength(5);
		expect(joined.styleProfileId).toBe('house');
		expect(joined.title).toBe('Riverbanks');
	});

	it('writes out each page’s bands as they read in its own comic', () => {
		const one = act('One', 2, 'ACT ONE');
		one.pages[1].bands = { header: { title: 'INTERLUDE' }, hidden: ['footer'] };
		const joined = joinComics('web', 'Riverbanks', [
			{ comic: one },
			{ comic: act('Two', 3, 'ACT TWO') }
		]);
		expect(joined.pages[0].bands?.header).toEqual({ title: 'ACT ONE', subtitle: 'One' });
		expect(joined.pages[0].bands?.footer?.center).toBe('1 / 2');
		expect(joined.pages[1].bands?.header?.title).toBe('INTERLUDE');
		expect(joined.pages[1].bands?.hidden).toEqual(['footer']);
		expect(joined.pages[4].bands?.footer?.center).toBe('3 / 3');
		expect(joined.pages[4].bands?.header?.title).toBe('ACT TWO');
	});

	it('leaves the sources untouched', () => {
		const one = act('One', 1, 'ACT ONE');
		joinComics('web', 'Riverbanks', [{ comic: one }]);
		expect(one.pages[0].bands).toBeUndefined();
	});

	it('refuses comics in different styles', () => {
		const two = act('Two', 1, 'ACT TWO');
		two.styleProfileId = 'other';
		expect(() =>
			joinComics('web', 'R', [{ comic: act('One', 1, 'ACT ONE') }, { comic: two }])
		).toThrow(/styles/);
	});
});

describe('joinComics with slices', () => {
	it('takes chosen pages, numbered as in their own comic', () => {
		const one = act('One', 5, 'ACT ONE');
		const boards = act('Boards', 3, 'BOARDS');
		const joined = joinComics('web', 'R', [
			{ comic: one, pages: [0] },
			{ comic: boards, pages: [2] },
			{ comic: one, pages: [1, 2, 3, 4] }
		]);
		expect(joined.pages.map((p) => p.bands?.footer?.center)).toEqual([
			'1 / 5',
			'3 / 3',
			'2 / 5',
			'3 / 5',
			'4 / 5',
			'5 / 5'
		]);
		expect(joined.pages[1].id).toBe(boards.pages[2].id);
	});

	it('lets a comic without a style join a styled one', () => {
		const boards = act('Boards', 1, '');
		delete boards.styleProfileId;
		const joined = joinComics('web', 'R', [{ comic: boards }, { comic: act('One', 1, '') }]);
		expect(joined.styleProfileId).toBe('house');
	});

	it('refuses a page the comic does not have', () => {
		expect(() => joinComics('web', 'R', [{ comic: act('One', 1, ''), pages: [3] }])).toThrow(
			/no page 4/
		);
	});
});

describe('relineHtml', () => {
	it('swaps each line, in paragraphs or across breaks', () => {
		expect(
			relineHtml('<p>YES</p><p>WE</p><p>K.A.N.</p>', ['KINETIC', 'ADAPTATION', 'ECONOMY'])
		).toBe('<p>KINETIC</p><p>ADAPTATION</p><p>ECONOMY</p>');
		expect(relineHtml('<p style="text-align: center">A<br>B</p>', ['X', 'Y & Z'])).toBe(
			'<p style="text-align: center">X<br>Y &amp; Z</p>'
		);
	});

	it('refuses lettering with a different number of lines', () => {
		expect(() => relineHtml('<p>ONE</p>', ['A', 'B'])).toThrow(/Expected 2/);
	});
});

describe('imagePage', () => {
	it('is a valid board covered edge to edge by the image, with no bands', () => {
		const page = imagePage('credits', 2000, 2830);
		expect(checkPage(page)).toEqual([]);
		expect(page.bands?.hidden).toEqual(['header', 'footer']);
		const free = page.panels.find((p) => p.kind === 'free');
		expect(free).toMatchObject({ x: 0, y: 0, w: 1000, h: 1416, border: 'none' });
		const image = free!.image!;
		expect(image.assetId).toBe('credits');
		expect(image.naturalWidth * image.scale).toBeGreaterThanOrEqual(1000);
		expect(image.naturalHeight * image.scale).toBeGreaterThanOrEqual(1416);
	});
});

describe('imageNeeds', () => {
	const image = (assetId: string, naturalWidth: number, scale: number) => ({
		assetId,
		naturalWidth,
		naturalHeight: naturalWidth,
		offsetX: 0,
		offsetY: 0,
		scale
	});

	it('lists each image once, at the widest it is drawn, with its comic', () => {
		const one = act('One', 2, '');
		one.pages[0].panels[0].image = image('a', 4000, 0.1);
		one.pages[1].panels[0].image = image('a', 4000, 0.25);
		const two = act('Two', 1, '');
		two.pages[0].panels[0].image = image('b', 2000, 0.5);
		expect(
			imageNeeds([
				{ id: 'c1', comic: one },
				{ id: 'c2', comic: two }
			])
		).toEqual([
			{ comicId: 'c1', assetId: 'a', width: 1000 },
			{ comicId: 'c2', assetId: 'b', width: 1000 }
		]);
	});
});

describe('targetWidth', () => {
	it('scales to the drawn size but never enlarges', () => {
		expect(targetWidth({ comicId: 'c', assetId: 'a', width: 500 }, 4000, 1.6)).toBe(800);
		expect(targetWidth({ comicId: 'c', assetId: 'a', width: 500 }, 600, 1.6)).toBe(600);
	});
});

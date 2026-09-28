import { describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import * as ops from './comic-ops';
import { comicScript, searchComic } from './script';

function sample() {
	const comic = createComic('Sediment');
	ops.mergePanels(comic, { page: 1, cells: [0, 1, 2, 3] });
	const top = comic.pages[0].panels.find((p) => p.kind === 'grid' && p.cells.length === 4)!;
	ops.addBalloon(comic, {
		page: 1,
		type: 'caption',
		text: 'Bangkok, October 2026',
		panelId: top.id
	});
	const five = comic.pages[0].panels.find((p) => p.kind === 'grid' && p.cells[0] === 5)!;
	ops.addBalloon(comic, {
		page: 1,
		type: 'speech',
		text: 'The river does **not** hoard.',
		panelId: five.id
	});
	ops.addPage(comic, {});
	const p2 = comic.pages[1].panels[0];
	ops.addBalloon(comic, {
		page: 2,
		type: 'thought',
		text: 'Where did the Hilsa go?',
		panelId: p2.id
	});
	return comic;
}

describe('comicScript', () => {
	it('writes pages in order, panels in reading order, balloons as “type: text”', () => {
		const text = comicScript(sample(), { id: 'c1', appUrl: 'https://app.test' });
		expect(text).toMatch(/^Sediment\n/);
		const p1 = text.indexOf('Page 1');
		const p2 = text.indexOf('Page 2');
		expect(p1).toBeGreaterThan(-1);
		expect(p2).toBeGreaterThan(p1);
		expect(text).toContain('https://app.test/comics/c1?page=2');
		// The caption sits in the wide top panel, before the speech balloon in cell 5.
		const caption = text.indexOf('caption: Bangkok, October 2026');
		const speech = text.indexOf('speech: The river does not hoard.');
		expect(caption).toBeGreaterThan(p1);
		expect(speech).toBeGreaterThan(caption);
		expect(speech).toBeLessThan(p2);
		expect(text).toContain('Panel 1 (cells 0–3)');
		expect(text).toContain('thought: Where did the Hilsa go?');
	});

	it('says so when a panel has no text or image', () => {
		const text = comicScript(createComic('Empty'), { id: 'e', appUrl: '' });
		expect(text).toContain('Panel 12 (cell 11): (empty)');
	});
});

describe('searchComic', () => {
	it('matches the title or balloon text, case-insensitively, and reports the first matching page', () => {
		const comic = sample();
		expect(searchComic(comic, 'sediment')).toEqual({ page: 1 });
		expect(searchComic(comic, 'HILSA')).toEqual({ page: 2 });
		expect(searchComic(comic, 'not hoard')).toEqual({ page: 1 }); // markdown stripped
		expect(searchComic(comic, 'zeppelin')).toBeNull();
	});
});

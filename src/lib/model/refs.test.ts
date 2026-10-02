import { describe, expect, it } from 'vitest';
import { createComic, createPage } from './factory';
import { mergePanels } from './panels';
import { createFreePanel } from './panels';
import {
	comicCode,
	defaultCode,
	isPanelRef,
	panelRef,
	readingOrder,
	resolvePanelRef
} from './refs';

describe('defaultCode', () => {
	it('takes the initials of the significant words', () => {
		expect(defaultCode('Taming Currents')).toBe('TC');
		expect(defaultCode('Visa for a Hilsa')).toBe('VH');
		expect(defaultCode('The Youngest Delegate')).toBe('YD');
		expect(defaultCode('The Year It Snowed')).toBe('YIS');
	});

	it('falls back to the first letters of a one-word or empty title', () => {
		expect(defaultCode('Riverbanks')).toBe('RIV');
		expect(defaultCode('')).toBe('C');
		expect(defaultCode('2065!')).toBe('206');
	});
});

describe('comicCode', () => {
	it('uses the comic’s own code, cleaned, else the default', () => {
		const c = createComic('Taming Currents', 'board');
		expect(comicCode(c)).toBe('TC');
		c.code = ' act-2 ';
		expect(comicCode(c)).toBe('ACT2');
	});
});

describe('panel refs', () => {
	function comic() {
		const c = createComic('Taming Currents', 'board');
		c.pages.push(createPage(c.pages[0].grid, c.pages[0]));
		return c;
	}

	it('numbers panels in reading order: grid panels by first cell, then free panels', () => {
		const c = comic();
		const page = c.pages[1];
		const free = createFreePanel(page);
		page.panels.unshift(free);
		const order = readingOrder(page);
		expect(order.at(-1)!.id).toBe(free.id);
		expect(panelRef(c, 1, order[0].id)).toBe('TC:2:1');
		expect(panelRef(c, 1, free.id)).toBe('TC:2:17');
	});

	it('renumbers after a merge', () => {
		const c = comic();
		const page = c.pages[0];
		const [p0, p1, p2] = readingOrder(page);
		expect(mergePanels(page, [p0.id, p1.id]).ok).toBe(true);
		expect(panelRef(c, 0, p2.id)).toBe('TC:1:2');
	});

	it('resolves a ref back to its page and panel, ignoring case', () => {
		const c = comic();
		const target = readingOrder(c.pages[1])[4];
		expect(resolvePanelRef(c, 'tc:2:5')).toEqual({ page: 2, panelId: target.id });
	});

	it('refuses a wrong code, a missing page and a missing panel, saying why', () => {
		const c = comic();
		expect(() => resolvePanelRef(c, 'VH:1:1')).toThrow(/TC/);
		expect(() => resolvePanelRef(c, 'TC:9:1')).toThrow(/2 pages/);
		expect(() => resolvePanelRef(c, 'TC:1:40')).toThrow(/16 panels/);
	});

	it('recognises refs and not uuids', () => {
		expect(isPanelRef('TC:2:3')).toBe(true);
		expect(isPanelRef('dc8351b8-3cd3-4a05-af32-cda1b8aa3247')).toBe(false);
	});
});

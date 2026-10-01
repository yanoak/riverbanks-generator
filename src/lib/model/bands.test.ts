import { describe, expect, it } from 'vitest';
import { createComic } from './factory';
import {
	HOUSE_BANDS,
	resetPageBands,
	resolveBands,
	setDefaultBands,
	setPageBands,
	useOnEveryPage
} from './bands';
import type { Comic } from './types';

function comic(): Comic {
	const c = createComic('Taming Currents', 'board');
	c.pages.push({ ...c.pages[0], id: 'p2' }, { ...c.pages[0], id: 'p3' });
	return c;
}

describe('resolveBands', () => {
	it('falls back to the house bands, with tokens filled in', () => {
		expect(HOUSE_BANDS.header.title).toBe('{comic}');
		expect(resolveBands(comic(), 1)).toEqual({
			header: { title: 'Taming Currents', subtitle: '' },
			footer: { left: 'RIVERBANKS', center: '2', right: 'SEAPUNK STUDIOS' }
		});
	});

	it('uses the comic’s own defaults', () => {
		const c = comic();
		c.bands = {
			header: { title: 'ACT TWO', subtitle: '{comic}' },
			footer: { left: '', center: '{page} / {pages}', right: '' }
		};
		expect(resolveBands(c, 2)).toEqual({
			header: { title: 'ACT TWO', subtitle: 'Taming Currents' },
			footer: { left: '', center: '3 / 3', right: '' }
		});
	});

	it('lets a page override single slots and blank others', () => {
		const c = comic();
		c.pages[0].bands = { header: { subtitle: 'The Invitation' }, footer: { right: '' } };
		const b = resolveBands(c, 0);
		expect(b.header).toEqual({ title: 'Taming Currents', subtitle: 'The Invitation' });
		expect(b.footer).toEqual({ left: 'RIVERBANKS', center: '1', right: '' });
	});

	it('leaves other pages on the default', () => {
		const c = comic();
		c.pages[0].bands = { header: { title: 'Only here' } };
		expect(resolveBands(c, 1).header.title).toBe('Taming Currents');
	});
});

describe('editing bands', () => {
	it('sets comic defaults slot by slot, starting from the house bands', () => {
		const c = comic();
		setDefaultBands(c, { header: { title: 'ACT TWO' } });
		expect(c.bands).toEqual({ ...HOUSE_BANDS, header: { title: 'ACT TWO', subtitle: '' } });
	});

	it('sets page overrides slot by slot', () => {
		const c = comic();
		setPageBands(c.pages[0], { header: { subtitle: 'One' } });
		setPageBands(c.pages[0], { header: { title: 'T' }, footer: { center: '' } });
		expect(c.pages[0].bands).toEqual({
			header: { subtitle: 'One', title: 'T' },
			footer: { center: '' }
		});
	});

	it('makes a page’s band the default and drops its override', () => {
		const c = comic();
		c.pages[0].bands = { header: { subtitle: 'The Summit' }, footer: { left: 'X' } };
		c.pages[1].bands = { header: { subtitle: 'Kept' } };
		useOnEveryPage(c, 0, 'header');
		expect(c.bands?.header).toEqual({ title: '{comic}', subtitle: 'The Summit' });
		expect(c.pages[0].bands).toEqual({ footer: { left: 'X' } });
		expect(c.pages[1].bands).toEqual({ header: { subtitle: 'Kept' } });
	});

	it('resets one band or both, removing the field when nothing is left', () => {
		const c = comic();
		c.pages[0].bands = { header: { title: 'A' }, footer: { left: 'B' } };
		resetPageBands(c.pages[0], 'footer');
		expect(c.pages[0].bands).toEqual({ header: { title: 'A' } });
		resetPageBands(c.pages[0]);
		expect(c.pages[0]).not.toHaveProperty('bands');
	});
});

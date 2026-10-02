import { describe, expect, it } from 'vitest';
import { createComic } from './factory';
import {
	bandShown,
	HOUSE_BANDS,
	qrHref,
	resetPageBands,
	resolveBands,
	setDefaultBands,
	setBandShown,
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
			footer: {
				left: 'Taming Currents',
				center: '2 / 3',
				right: 'RIVERBANKS · SEAPUNK STUDIOS',
				qr: 'riverbanks.lol'
			}
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
			footer: { left: '', center: '3 / 3', right: '', qr: 'riverbanks.lol' }
		});
	});

	it('lets a page override single slots and blank others', () => {
		const c = comic();
		c.pages[0].bands = { header: { subtitle: 'The Invitation' }, footer: { right: '' } };
		const b = resolveBands(c, 0);
		expect(b.header).toEqual({ title: 'Taming Currents', subtitle: 'The Invitation' });
		expect(b.footer).toEqual({
			left: 'Taming Currents',
			center: '1 / 3',
			right: '',
			qr: 'riverbanks.lol'
		});
	});

	it('leaves other pages on the default', () => {
		const c = comic();
		c.pages[0].bands = { header: { title: 'Only here' } };
		expect(resolveBands(c, 1).header.title).toBe('Taming Currents');
	});
});

describe('turning bands on and off', () => {
	it('shows a band only where the page has room for it and it isn’t hidden', () => {
		const c = comic();
		expect(bandShown(c.pages[0], 'header')).toBe(true);
		c.pages[0].bands = { hidden: ['header'] };
		expect(bandShown(c.pages[0], 'header')).toBe(false);
		expect(bandShown(c.pages[0], 'footer')).toBe(true);
		expect(bandShown(createComic('Old').pages[0], 'footer')).toBe(false);
	});

	it('hides and shows one band, keeping the page’s text', () => {
		const c = comic();
		setPageBands(c.pages[0], { footer: { left: 'Mine' } });
		setBandShown(c.pages[0], 'footer', false);
		setBandShown(c.pages[0], 'footer', false);
		expect(c.pages[0].bands).toEqual({ footer: { left: 'Mine' }, hidden: ['footer'] });
		setBandShown(c.pages[0], 'footer', true);
		expect(c.pages[0].bands).toEqual({ footer: { left: 'Mine' } });
	});

	it('leaves no bands behind once everything is back to the default', () => {
		const c = comic();
		setBandShown(c.pages[0], 'header', false);
		setBandShown(c.pages[0], 'header', true);
		expect(c.pages[0]).not.toHaveProperty('bands');
	});

	it('keeps a hidden band hidden when its text is reset', () => {
		const c = comic();
		c.pages[0].bands = { header: { title: 'A' }, hidden: ['header'] };
		resetPageBands(c.pages[0], 'header');
		expect(c.pages[0].bands).toEqual({ hidden: ['header'] });
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

describe('footer QR link', () => {
	it('defaults to riverbanks.lol, and a page can change or blank it', () => {
		const c = comic();
		expect(resolveBands(c, 0).footer.qr).toBe('riverbanks.lol');
		setPageBands(c.pages[1], { footer: { qr: '' } });
		expect(resolveBands(c, 1).footer.qr).toBe('');
		setPageBands(c.pages[2], { footer: { qr: 'example.org/{page}' } });
		expect(resolveBands(c, 2).footer.qr).toBe('example.org/3');
	});

	it('fills a slot that stored bands predate from the house bands', () => {
		const c = comic();
		c.bands = {
			header: { title: 'ACT TWO', subtitle: '' },
			footer: { left: '', center: '{page}', right: '' }
		} as Comic['bands'];
		expect(resolveBands(c, 0).footer.qr).toBe('riverbanks.lol');
	});

	it('links a bare host over https and keeps an explicit scheme', () => {
		expect(qrHref('riverbanks.lol')).toBe('https://riverbanks.lol');
		expect(qrHref('http://example.org/x')).toBe('http://example.org/x');
		expect(qrHref('  ')).toBe('');
	});
});

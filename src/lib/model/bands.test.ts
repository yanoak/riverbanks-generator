import { describe, expect, it } from 'vitest';
import { createComic } from './factory';
import { HOUSE_BANDS, resolveBands } from './bands';
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

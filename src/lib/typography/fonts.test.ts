import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FONTS, fontStack } from './fonts';

// The PNG export only sees fonts the page has loaded, so every catalog font must be in app.html.
const html = readFileSync('src/app.html', 'utf8');
const url = decodeURIComponent(html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/)![0]);
const requested = new Map(
	[...url.matchAll(/family=([^&]+)/g)].map((m) => {
		const [name, axes] = m[1].split(':');
		return [name.replace(/\+/g, ' '), axes ?? ''];
	})
);

describe('the font catalog', () => {
	it.each(FONTS.map((f) => [f.family, f]))('app.html loads %s in every weight', (_, font) => {
		const axes = requested.get(font.family);
		expect(axes, `${font.family} is not in app.html`).toBeDefined();
		const range = axes!.match(/(\d+)\.\.(\d+)/);
		for (const w of font.weights) {
			if (range) expect(w).toBeGreaterThanOrEqual(Number(range[1]));
			if (range) expect(w).toBeLessThanOrEqual(Number(range[2]));
			else if (w !== 400) expect(axes).toContain(String(w));
		}
	});

	it('quotes the family and ends in a generic fallback', () => {
		expect(fontStack('Rubik Microbe')).toMatch(/^'Rubik Microbe', .*(sans-serif|cursive)$/);
	});
});

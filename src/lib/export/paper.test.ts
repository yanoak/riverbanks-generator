import { describe, expect, it } from 'vitest';
import { fitPage, readExportPrefs, sheetFor, writeExportPrefs } from './paper';
import type { WatermarkStorage } from './watermark';

const PX_PER_MM = 96 / 25.4;

describe('sheetFor', () => {
	it('keeps the original sheet: A1 for boards, US comic trim for comic pages', () => {
		const a1 = sheetFor('original', 'board');
		expect([a1.widthMm, a1.heightMm]).toEqual([594, 841]);
		expect([a1.width, a1.height]).toEqual(['594mm', '841mm']);
		expect(a1.px).toBeCloseTo(594 * PX_PER_MM);
		const comic = sheetFor('original', 'comic');
		expect(comic.widthMm).toBeCloseTo(6.625 * 25.4);
		expect(comic.heightMm).toBeCloseTo(10.25 * 25.4);
		expect(sheetFor('original', null).widthMm).toBeCloseTo(6.625 * 25.4);
	});

	it('uses the named paper whatever the page format', () => {
		for (const format of ['board', 'comic', null] as const) {
			expect(sheetFor('b5', format)).toMatchObject({
				widthMm: 176,
				heightMm: 250,
				width: '176mm',
				height: '250mm'
			});
			expect(sheetFor('a4', format)).toMatchObject({ widthMm: 210, heightMm: 297 });
			expect(sheetFor('a5', format)).toMatchObject({ widthMm: 148, heightMm: 210 });
		}
		expect(sheetFor('b5', 'board').px).toBeCloseTo(176 * PX_PER_MM);
		expect(sheetFor('b5', 'board').pxHeight).toBeCloseTo(250 * PX_PER_MM);
	});
});

describe('fitPage', () => {
	it('fits a board to the width of B5 and centres it vertically', () => {
		const sheet = sheetFor('b5', 'board');
		const fit = fitPage(sheet, { width: 1000, height: 1416 });
		expect(fit.scale).toBeCloseTo(sheet.px / 1000);
		expect(fit.left).toBeCloseTo(0);
		expect(fit.top).toBeGreaterThan(0);
		expect(fit.top * 2 + 1416 * fit.scale).toBeCloseTo(sheet.pxHeight);
	});

	it('fits a tall comic page to the height and centres it horizontally', () => {
		const sheet = sheetFor('b5', 'comic');
		const fit = fitPage(sheet, { width: 1000, height: 1545 });
		expect(fit.scale).toBeCloseTo(sheet.pxHeight / 1545);
		expect(fit.top).toBeCloseTo(0);
		expect(fit.left * 2 + 1000 * fit.scale).toBeCloseTo(sheet.px);
	});

	it('fills an original sheet to within a pixel', () => {
		const fit = fitPage(sheetFor('original', 'board'), { width: 1000, height: 1416 });
		expect(fit.left).toBeLessThan(1);
		expect(fit.top).toBeLessThan(1);
	});
});

function memory(): WatermarkStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v)
	};
}

describe('readExportPrefs / writeExportPrefs', () => {
	it('round-trips the choice', () => {
		const storage = memory();
		writeExportPrefs(storage, { format: 'png', paper: 'b5' });
		expect(readExportPrefs(storage)).toEqual({ format: 'png', paper: 'b5' });
	});

	it('reads anything missing or unknown as PDF on the original sheet', () => {
		const fallback = { format: 'pdf', paper: 'original' };
		expect(readExportPrefs(memory())).toEqual(fallback);
		expect(readExportPrefs(undefined)).toEqual(fallback);
		const odd = memory();
		odd.data.set('riverbanks:export', JSON.stringify({ format: 'gif', paper: 'b5' }));
		expect(readExportPrefs(odd)).toEqual({ format: 'pdf', paper: 'b5' });
		odd.data.set('riverbanks:export', JSON.stringify({ format: 'png', paper: 'letter' }));
		expect(readExportPrefs(odd)).toEqual({ format: 'png', paper: 'original' });
		odd.data.set('riverbanks:export', '{nope');
		expect(readExportPrefs(odd)).toEqual(fallback);
	});
});

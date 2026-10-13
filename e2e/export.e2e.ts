import { expect, test } from '@playwright/test';
import { openEditor } from './support/editor';
import { readFile } from 'node:fs/promises';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer) {
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function dropImage(page: import('@playwright/test').Page, panelIndex: number) {
	await page.evaluate(async (i) => {
		const c = document.createElement('canvas');
		c.width = 800;
		c.height = 600;
		const g = c.getContext('2d')!;
		g.fillStyle = '#8ecae6';
		g.fillRect(0, 0, 800, 600);
		g.fillStyle = '#ffb703';
		g.beginPath();
		g.arc(400, 300, 150, 0, 7);
		g.fill();
		const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
		const dt = new DataTransfer();
		dt.items.add(new File([blob], 'sun.png', { type: 'image/png' }));
		const panel = document.querySelectorAll('main [data-panel-id]')[i];
		panel.dispatchEvent(
			new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })
		);
	}, panelIndex);
}

test('exports the current page as a 2× PNG with its image and lettering', async ({ page }) => {
	await openEditor(page, '/local');
	const panels = page.locator('main [data-panel-id]');
	await panels.first().click();
	await page.keyboard.press('Shift+ArrowRight');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+ArrowLeft');
	await page.keyboard.press('m');
	await dropImage(page, 0);
	await expect(page.locator('main img')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await panels.nth(3).click();
	await page.keyboard.press('s');
	await expect(page.locator('main .ProseMirror')).toBeFocused(); // TipTap focuses on the next tick
	await page.keyboard.type('HELLO RIVER!');
	await page.keyboard.press('Escape');
	await panels.nth(6).click();
	await page.keyboard.press('x');
	await page.keyboard.press('Escape');

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('radio', { name: /^PNG/ }).check();
	await page.getByRole('button', { name: 'Download' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toBe('untitled-comic-page-1.png');
	const path = test.info().outputPath('page-1.png');
	await file.saveAs(path);
	const buf = await readFile(path);
	expect(pngSize(buf)).toEqual({ width: 2000, height: 3090 });
	await expect(page.locator('main .balloon-text').first()).toHaveText('HELLO RIVER!');
	if (process.env.EXPORT_COPY) await file.saveAs(process.env.EXPORT_COPY);
});

test('prints every page on its own sheet for PDF', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'page.pdf is Chromium-only');
	await openEditor(page, '/local');
	await page.getByRole('button', { name: 'Add page' }).click();
	await page.getByRole('button', { name: 'Add page' }).click();
	const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
	const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
	expect(pages).toHaveLength(3);
});

test('the download dialog works from the keyboard', async ({ page }) => {
	await openEditor(page, '/local');
	const exportButton = page.getByRole('button', { name: 'Export', exact: true });
	await exportButton.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: /^Download/ });
	await expect(dialog).toBeVisible();
	await expect(page.getByRole('radio', { name: /^PDF/ })).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.getByRole('radio', { name: /^PNG/ })).toBeChecked();
	await expect(page.getByRole('combobox', { name: 'Paper size' })).toBeDisabled();
	await page.keyboard.press('ArrowUp');
	await expect(page.getByRole('combobox', { name: 'Paper size' })).toBeEnabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(exportButton).toBeFocused();
});

test('B5 sets the printed sheet and fits each page inside it', async ({ page }) => {
	await openEditor(page, '/local');
	await page.evaluate(() => (window.print = () => {}));
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('combobox', { name: 'Paper size' }).selectOption('b5');
	await page.getByRole('button', { name: 'Download' }).click();
	await expect(page.locator('head style', { hasText: '@page' }).last()).toHaveText(
		/size: 176mm 250mm/
	);
	const sheet = page.locator('.print-page').first();
	await expect(sheet).toHaveAttribute('style', /width: 176mm; height: 250mm/);
	await page.reload();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(page.getByRole('combobox', { name: 'Paper size' })).toHaveValue('b5');
});

test('a watermark goes on every printed page, and stays on after a reload', async ({ page }) => {
	await openEditor(page, '/local');
	await page.evaluate(() => (window.print = () => {}));
	await page.getByRole('button', { name: 'Add page' }).click();
	const marks = page.locator('.print-pages [data-watermark]');
	await expect(marks).toHaveCount(0);

	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('checkbox', { name: 'Add a watermark' }).check();
	await page.getByRole('textbox', { name: 'Text', exact: true }).fill('DRAFT');
	await page.keyboard.press('Enter');
	await expect(marks).toHaveCount(2);
	await expect(marks.first()).toHaveText('DRAFT');
	await expect(marks.first()).toHaveAttribute('data-watermark', 'edge');
	await expect(page.locator('main [data-watermark]')).toHaveCount(0);

	await page.reload();
	await expect(page.locator('.print-pages [data-watermark]').first()).toHaveText('DRAFT');
});

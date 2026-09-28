import { expect, test } from '@playwright/test';
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
	await page.goto('/');
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
	await page.getByRole('button', { name: 'PNG' }).click();
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
	await page.goto('/');
	await page.getByRole('button', { name: 'Add page' }).click();
	await page.getByRole('button', { name: 'Add page' }).click();
	const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
	const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
	expect(pages).toHaveLength(3);
});

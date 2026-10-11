import { expect, test } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { newComic, waitForEditor, waitForLive } from './support/editor';

test('leaving the editor saves a thumbnail, and My comics shows it as an image', async ({
	page
}) => {
	const { email } = await createUser('thumbs');
	await signIn(page, email);
	await page.waitForURL('**/comics');
	await newComic(page);
	await waitForEditor(page);
	await waitForLive(page);

	const panels = page.locator('main [data-panel-id]');
	const before = await panels.count();
	await panels.first().click();
	await page.keyboard.press('Shift+ArrowRight');
	await page.keyboard.press('m');
	await expect(panels).toHaveCount(before - 1);

	// A big image in the merged panel: the thumbnail must not carry it at full size.
	const big = await page.evaluate(() => {
		const c = document.createElement('canvas');
		[c.width, c.height] = [3000, 2000];
		const g = c.getContext('2d')!;
		g.fillStyle = '#1d3557';
		g.fillRect(0, 0, 3000, 2000);
		g.fillStyle = '#e63946';
		g.fillRect(600, 500, 1800, 1000);
		return c.toDataURL('image/png').split(',')[1];
	});
	await page
		.locator('aside input[type=file]')
		.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.from(big, 'base64') });
	await expect(page.getByText('Replace…')).toBeVisible({ timeout: 15_000 }); // local Storage is slow
	await expect(page.locator('main img')).not.toHaveCount(0);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// Back by keyboard, through the app's own link: the close-out runs before the list loads.
	const uploads: string[] = [];
	page.on('request', (r) => {
		if (r.method() === 'POST' && /\/object\/assets\/.*\/thumb-/.test(r.url()))
			uploads.push(r.url());
	});
	await page.keyboard.press('Escape'); // with an image panel selected, Enter means image mode
	await page.getByRole('link', { name: 'Riverbanks' }).focus();
	await page.keyboard.press('Enter');
	await page.waitForURL('**/comics');
	const card = page.locator('main li').filter({ hasText: 'Untitled comic' });
	await expect(card.locator('img[data-thumb]')).toBeVisible();
	await expect(card.locator('[data-live-thumb]')).toHaveCount(0);
	expect(uploads).toHaveLength(1);
	const thumb = card.locator('img[data-thumb]');
	const stored = await page.request.get((await thumb.getAttribute('src'))!);
	expect((await stored.body()).length).toBeLessThan(60_000); // the 3000 × 2000 image, shrunk
	await card.locator('img[data-thumb]').screenshot({ path: 'test-results/thumbnail.png' });

	// A reload draws nothing live, and downloads no panel images for the card.
	await page.reload();
	await expect(card.locator('img[data-thumb]')).toHaveAttribute('src', /thumb-[0-9a-f]{16}\.webp/);
	await expect(card.locator('[data-live-thumb]')).toHaveCount(0);

	// Opening and leaving again without touching page 1 uploads nothing new.
	await card.getByRole('link').click();
	await waitForEditor(page);
	await page.getByRole('link', { name: 'Riverbanks' }).click();
	await page.waitForURL('**/comics');
	await expect(card.locator('img[data-thumb]')).toBeVisible();
	expect(uploads).toHaveLength(1);
});

test('a comic with no thumbnail is drawn live once, then shown as an image', async ({ page }) => {
	const { email } = await createUser('thumbs-live');
	await signIn(page, email);
	await page.waitForURL('**/comics');
	await newComic(page);
	await waitForEditor(page);

	// A full page load skips the close-out, as an edit over MCP would.
	await page.goto('/comics');
	const card = page.locator('main li').filter({ hasText: 'Untitled comic' });
	await expect(card.locator('[data-live-thumb]')).toBeVisible();
	await page.waitForResponse((r) => /\/object\/assets\/.*\/thumb-/.test(r.url()));

	await page.reload();
	await expect(card.locator('img[data-thumb]')).toBeVisible();
	await expect(card.locator('[data-live-thumb]')).toHaveCount(0);
});

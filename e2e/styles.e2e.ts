import { expect, test } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { waitForEditor } from './support/editor';
import { pngFile } from './support/images';

test('make a style from references, describe it, and share it read-only', async ({ browser }) => {
	const [maker, other] = await Promise.all([createUser('maker'), createUser('other')]);
	// Styles are team-wide, so other runs' styles may be listed too: this one gets its own name.
	const name = `Tidewater ink ${crypto.randomUUID().slice(0, 6)}`;
	const page = await (await browser.newContext()).newPage();
	await signIn(page, maker.email);

	await page.getByRole('link', { name: 'Styles' }).click();
	await page.waitForURL('**/styles');
	await page.locator('body[data-hydrated]').waitFor();
	await page.keyboard.press('n');
	await page.waitForURL(/\/styles\/[0-9a-f-]{36}$/);
	await page.locator('body[data-hydrated]').waitFor();
	const path = new URL(page.url()).pathname;

	await page.getByLabel('Style name').fill(name);
	await page.locator('input[type=file]').setInputFiles([pngFile('mae.png'), pngFile('ink.png')]);
	await expect(page.getByRole('button', { name: 'Remove reference 2' })).toBeVisible();

	await page.getByRole('button', { name: 'Describe from references' }).click();
	await expect(page.getByLabel('Style', { exact: true })).toHaveValue(/Fake style/);
	await expect(page.getByLabel('Colour 1, deep navy')).toHaveValue('#1d3557');
	await expect(page.getByLabel('Avoid')).toHaveValue('gradients');
	await expect(page.getByRole('status')).toHaveText('Saved ✓');

	// Removing a reference by keyboard moves focus to the next one's remove button.
	await page.getByRole('button', { name: 'Remove reference 1' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Remove reference 1' })).toBeFocused();
	await page.getByRole('button', { name: 'Remove reference 1' }).press('Enter');
	await expect(page.getByRole('button', { name: 'Remove reference 1' })).toHaveCount(0);
	await page.locator('input[type=file]').setInputFiles([pngFile('ink.png')]);
	await expect(page.getByRole('button', { name: 'Remove reference 1' })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('Saved ✓');

	await page.reload();
	await expect(page.getByLabel('Style name')).toHaveValue(name);
	await expect(page.getByRole('button', { name: 'Remove reference 1' })).toBeVisible();
	await expect(page.getByLabel('Style', { exact: true })).toHaveValue(/Fake style/);

	// Someone else sees it in the list and can open it, but not change it.
	const otherPage = await (await browser.newContext()).newPage();
	await signIn(otherPage, other.email);
	await otherPage.goto('/styles');
	await expect(otherPage.getByRole('link', { name: new RegExp(name) })).toContainText(
		`by ${maker.email}`
	);
	await otherPage.goto(path);
	await expect(otherPage.getByText(/read-only/)).toBeVisible();
	await expect(otherPage.getByLabel('Style name')).toHaveAttribute('readonly', '');
	await expect(otherPage.getByRole('button', { name: 'Delete' })).toHaveCount(0);
	await expect(otherPage.getByRole('button', { name: 'Describe from references' })).toHaveCount(0);

	// A new comic with this style, by keyboard: N, title, Tab into the styles, ↓ wraps from
	// "No style" to the first one (the most recently edited, so this one), Enter creates.
	await page.goto('/comics');
	await page.locator('body[data-hydrated]').waitFor();
	await page.keyboard.press('n');
	await page.keyboard.type('Sediment');
	await page.keyboard.press('Tab');
	await expect(page.getByRole('radio', { name: 'No style' })).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.getByRole('radio', { name })).toBeChecked();
	await page.keyboard.press('Enter');
	await page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	await waitForEditor(page);
	const comicPath = new URL(page.url()).pathname;
	const style = page.locator('[data-comic-style]');
	await expect(style).toHaveText(name);

	// Change… opens on the current style; picking None is one undo step.
	await page.getByRole('button', { name: 'Change…' }).click();
	const dialog = page.getByRole('dialog', { name: 'Comic style' });
	await expect(dialog.getByRole('radio', { name })).toBeFocused();
	await page.keyboard.press('ArrowUp'); // wraps to "No style", the last choice
	await expect(dialog.getByRole('radio', { name: 'No style' })).toBeChecked();
	await page.keyboard.press('Enter');
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('button', { name: 'Change…' })).toBeFocused();
	await expect(style).toHaveText('None');
	await page.locator('[data-canvas]').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('ControlOrMeta+z');
	await expect(style).toHaveText(name);

	await page.goto(path);
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Really delete?' }).click();
	await page.waitForURL('**/styles');
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);

	// The comic keeps the link and says the style has gone.
	await page.goto(comicPath);
	await waitForEditor(page);
	await expect(style).toHaveText('Style deleted');
});

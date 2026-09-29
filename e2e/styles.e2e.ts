import { expect, test } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { pngFile } from './support/images';

test('make a style from references, describe it, and share it read-only', async ({ browser }) => {
	const [maker, other] = await Promise.all([createUser('maker'), createUser('other')]);
	const page = await (await browser.newContext()).newPage();
	await signIn(page, maker.email);

	await page.getByRole('link', { name: 'Styles' }).click();
	await page.waitForURL('**/styles');
	await expect(page.getByText('No styles yet')).toBeVisible();
	await page.locator('body[data-hydrated]').waitFor();
	await page.keyboard.press('n');
	await page.waitForURL(/\/styles\/[0-9a-f-]{36}$/);
	await page.locator('body[data-hydrated]').waitFor();
	const path = new URL(page.url()).pathname;

	await page.getByLabel('Style name').fill('Tidewater ink');
	await page.locator('input[type=file]').setInputFiles([pngFile('mae.png'), pngFile('ink.png')]);
	await expect(page.getByLabel('Reference 2 role')).toBeVisible();
	await page.getByLabel('Reference 1 role').selectOption('character');
	await page.getByLabel('Reference 1 name').fill('Mae');
	await page.getByLabel('Reference 1 name').press('Tab');

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
	await expect(page.getByLabel('Reference 1 role')).toHaveCount(0);
	await page.locator('input[type=file]').setInputFiles([pngFile('mae.png')]);
	await page.getByLabel('Reference 1 role').selectOption('character');
	await page.getByLabel('Reference 1 name').fill('Mae');
	await page.getByLabel('Reference 1 name').press('Tab');
	await expect(page.getByRole('status')).toHaveText('Saved ✓');

	await page.reload();
	await expect(page.getByLabel('Style name')).toHaveValue('Tidewater ink');
	await expect(page.getByLabel('Reference 1 name')).toHaveValue('Mae');
	await expect(page.getByLabel('Style', { exact: true })).toHaveValue(/Fake style/);

	// Someone else sees it in the list and can open it, but not change it.
	const otherPage = await (await browser.newContext()).newPage();
	await signIn(otherPage, other.email);
	await otherPage.goto('/styles');
	await expect(otherPage.getByRole('link', { name: /Tidewater ink/ })).toContainText(
		`by ${maker.email}`
	);
	await otherPage.goto(path);
	await expect(otherPage.getByText(/read-only/)).toBeVisible();
	await expect(otherPage.getByLabel('Style name')).toHaveAttribute('readonly', '');
	await expect(otherPage.getByRole('button', { name: 'Delete' })).toHaveCount(0);
	await expect(otherPage.getByRole('button', { name: 'Describe from references' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Really delete?' }).click();
	await page.waitForURL('**/styles');
	await expect(page.getByText('No styles yet')).toBeVisible();
});

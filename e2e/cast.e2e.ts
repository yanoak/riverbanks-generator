import { expect, test } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { waitForEditor, waitForLive } from './support/editor';
import { pngFile } from './support/images';

// The preview server runs with GENERATION_PROVIDER=fake: sheets and panels are test patterns.
test('build a cast with a drawn sheet; a panel gets whoever its prompt names', async ({
	browser
}) => {
	const { email } = await createUser('cast');
	const page = await (await browser.newContext()).newPage();
	await signIn(page, email);

	await page.goto('/styles');
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByRole('button', { name: '+ New style' }).click();
	await page.waitForURL(/\/styles\/[0-9a-f-]{36}$/);
	await page.locator('body[data-hydrated]').waitFor();
	const name = `Cast ink ${crypto.randomUUID().slice(0, 6)}`;
	await page.getByLabel('Style name').fill(name);
	await page.locator('input[type=file]').setInputFiles([pngFile('ink.png')]);
	await expect(page.getByRole('button', { name: 'Remove reference 1' })).toBeVisible();
	await expect(page.getByText('No cast yet')).toBeVisible();

	// + Character opens the new member's dialog; fill it in by keyboard.
	await page.getByRole('button', { name: '+ Character' }).click();
	const dialog = page.getByRole('dialog', { name: /Cast member/ });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Name').fill('Mae');
	await dialog.getByLabel('Also called').fill('the girl, Maesie');
	await dialog.getByLabel('Description').fill('Twelve, red scarf, bare feet');
	await dialog.getByLabel('Description').press('Tab');

	// ⌘↵ draws a sheet, which becomes the starred portrait.
	await page.keyboard.press('ControlOrMeta+Enter');
	const portraits = dialog.getByRole('radiogroup', { name: 'Portraits' }).getByRole('radio');
	await expect(portraits).toHaveCount(1);
	await expect(portraits.first()).toHaveAttribute('aria-checked', 'true');

	// A second portrait by upload; Space stars it.
	await dialog.locator('input[type=file]').setInputFiles([pngFile('mae.png')]);
	await expect(portraits).toHaveCount(2);
	await portraits.first().focus();
	await page.keyboard.press('ArrowRight');
	await expect(portraits.nth(1)).toBeFocused();
	await page.keyboard.press(' ');
	await expect(portraits.nth(1)).toHaveAttribute('aria-checked', 'true');

	// Esc closes and returns focus to the member's card.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	const card = page.locator('[data-cast-card]');
	await expect(card).toBeFocused();
	await expect(card).toContainText('Mae');
	await expect(card).toContainText('also the girl, Maesie');

	// It all survives a reload.
	await page.reload();
	await page.locator('body[data-hydrated]').waitFor();
	await page.locator('[data-cast-card]').click();
	await expect(dialog.getByLabel('Description')).toHaveValue('Twelve, red scarf, bare feet');
	await expect(portraits.nth(1)).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');

	// A comic in this style: the prompt names Mae by an alias, so she is attached.
	await page.goto('/comics');
	await page.getByRole('button', { name: '+ New comic' }).click();
	await page.getByRole('radio', { name }).check();
	await page.getByRole('button', { name: 'Create' }).click();
	await page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	await waitForEditor(page);
	await waitForLive(page);
	await page.locator('main [data-panel-id]').first().click();
	await page.keyboard.press('g');
	const prompt = page.getByRole('textbox', { name: 'Prompt' });
	const cast = page.getByRole('group', { name: 'Cast in this panel' });
	await prompt.fill('an empty river at dawn');
	await expect(cast).toContainText('Nobody named yet');
	await prompt.fill('the girl on the raft at dawn');
	await expect(cast.getByRole('button', { name: 'Remove Mae from this panel' })).toBeVisible();
	await expect(cast).toContainText('auto');

	await page.keyboard.press('ControlOrMeta+Enter');
	const takes = page.getByRole('radiogroup', { name: 'Takes' }).getByRole('radio');
	await expect(takes).toHaveCount(1);

	// Backspace on the chip drops her for this panel (custom); ↺ Auto brings her back.
	await cast.getByRole('button', { name: 'Remove Mae from this panel' }).focus();
	await page.keyboard.press('Backspace');
	await expect(cast).toContainText('custom');
	await expect(cast.getByRole('button', { name: /Remove Mae/ })).toHaveCount(0);
	await expect(cast.getByRole('combobox', { name: 'Add to this panel’s cast' })).toBeFocused();
	await cast.getByRole('button', { name: '↺ Auto' }).click();
	await expect(cast.getByRole('button', { name: 'Remove Mae from this panel' })).toBeVisible();
	await expect(cast).toContainText('auto');
});

import { expect, test } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { waitForEditor, waitForLive } from './support/editor';
import { pngFile } from './support/images';

// The preview server runs with GENERATION_PROVIDER=fake: images are flat test patterns.
test('prompt a panel in the comic’s style, keep takes, switch between them', async ({
	browser
}) => {
	const { email } = await createUser('gen');
	const page = await (await browser.newContext()).newPage();
	await signIn(page, email);

	// A style with one reference.
	await page.goto('/styles');
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByRole('button', { name: '+ New style' }).click();
	await page.waitForURL(/\/styles\/[0-9a-f-]{36}$/);
	await page.locator('body[data-hydrated]').waitFor();
	const name = `Gen ink ${crypto.randomUUID().slice(0, 6)}`;
	await page.getByLabel('Style name').fill(name);
	await page.locator('input[type=file]').setInputFiles([pngFile('ink.png')]);
	await expect(page.getByLabel('Reference 1 role')).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('Saved ✓');

	// A comic in that style.
	await page.goto('/comics');
	await page.getByRole('button', { name: '+ New comic' }).click();
	await page.getByRole('radio', { name }).check();
	await page.getByRole('button', { name: 'Create' }).click();
	await page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	await waitForEditor(page);
	await waitForLive(page);

	// Select the first panel, G focuses its prompt, ⌘Enter generates.
	const panel = page.locator('main [data-panel-id]').first();
	await panel.click();
	await page.keyboard.press('g');
	const prompt = page.getByRole('textbox', { name: 'Prompt' });
	await expect(prompt).toBeFocused();
	await expect(page.getByRole('region', { name: 'Generate' })).toContainText(name);
	await prompt.fill('Mae on the raft at dawn');
	await page.keyboard.press('ControlOrMeta+Enter');
	const takes = page.getByRole('radiogroup', { name: 'Takes' }).getByRole('radio');
	await expect(takes).toHaveCount(1);
	await expect(takes.first()).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('main img').first()).toBeVisible();
	await expect(prompt).toBeFocused();

	// A second take becomes current; → in the takes goes back to the first; ⌘Z undoes that.
	await prompt.fill('Mae on the raft at dusk');
	await page.keyboard.press('ControlOrMeta+Enter');
	await expect(takes).toHaveCount(2);
	await expect(takes.first()).toHaveAttribute('aria-checked', 'true');
	await takes.first().focus();
	await page.keyboard.press('ArrowRight');
	await expect(takes.nth(1)).toHaveAttribute('aria-checked', 'true');
	await expect(takes.nth(1)).toBeFocused();
	await expect(prompt).toHaveValue('Mae on the raft at dawn');
	await page.keyboard.press('ControlOrMeta+z');
	await expect(takes.first()).toHaveAttribute('aria-checked', 'true');
	await expect(prompt).toHaveValue('Mae on the raft at dusk');

	// A print version of the chosen take: a third take, marked 4K, now current.
	await page.getByRole('button', { name: 'Print version (4K)' }).click();
	await expect(takes).toHaveCount(3);
	await expect(takes.first()).toHaveAccessibleName(/4K print/);
	await expect(takes.first()).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByRole('button', { name: 'Print version ✓' })).toBeDisabled();

	// Esc in the prompt returns to the panel on the canvas.
	await prompt.focus();
	await page.keyboard.press('Escape');
	await expect(panel).toBeFocused();

	// The prompt and takes are kept.
	await page.reload();
	await waitForEditor(page);
	await page.locator('main [data-panel-id]').first().click();
	await expect(prompt).toHaveValue('Mae on the raft at dusk');
	await expect(takes).toHaveCount(3);

	// A Claude sketch: SVG at the panel's exact shape, marked SVG, and no print version.
	await page
		.getByRole('combobox', { name: 'Model' })
		.selectOption({ label: 'Sketch (SVG, Claude)' });
	await prompt.focus();
	await page.keyboard.press('ControlOrMeta+Enter');
	await expect(takes).toHaveCount(4);
	await expect(takes.first()).toHaveAccessibleName(/SVG sketch/);
	await expect(takes.first()).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('main img[src]').first()).toBeVisible();
	await expect(page.getByRole('button', { name: /Print version/ })).toHaveCount(0);
});

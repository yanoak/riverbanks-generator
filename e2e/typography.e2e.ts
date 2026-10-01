import { expect, test, type Locator } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { arrowTo } from './support/styles';
import { openEditor, waitForEditor } from './support/editor';

const family = (text: Locator) => text.evaluate((el) => getComputedStyle(el).fontFamily);

test('with no style, balloons and the app are lettered in Rubik', async ({ page }) => {
	await openEditor(page, '/local');
	await page.locator('main [data-panel-id]').first().click();
	await page.keyboard.press('s');
	await page.keyboard.press('Escape');
	await expect.poll(() => family(page.locator('main .balloon-text'))).toMatch(/^Rubik,/);
	expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^Rubik,/);
});

test('balloons follow their style’s typography unless given a font of their own', async ({
	page
}) => {
	const maker = await createUser('letterer');
	const name = `Dirt captions ${crypto.randomUUID().slice(0, 6)}`;
	await signIn(page, maker.email);

	// A style whose captions are in Rubik Dirt.
	await page.goto('/styles');
	await page.locator('body[data-hydrated]').waitFor();
	await page.keyboard.press('n');
	await page.waitForURL(/\/styles\/[0-9a-f-]{36}$/);
	await page.locator('body[data-hydrated]').waitFor();
	const stylePath = new URL(page.url()).pathname;
	await page.getByLabel('Style name').fill(name);
	// The font menu shows each font in its own face; ↓ opens it, type-ahead and Enter pick.
	await page.getByRole('button', { name: /^Caption font/ }).focus();
	await page.keyboard.press('ArrowDown');
	const menu = page.getByRole('listbox', { name: 'Caption font' });
	await expect(menu).toBeFocused();
	await expect(
		menu.getByRole('option', { name: 'Rubik Wet Paint' }).getByText('Rubik Wet Paint')
	).toHaveCSS('font-family', /^"Rubik Wet Paint"/);
	await page.keyboard.type('Rubik D');
	await page.keyboard.press('Enter');
	await expect(menu).toBeHidden();
	await expect(page.getByRole('button', { name: 'Caption font: Rubik Dirt' })).toBeFocused();
	await expect(page.getByLabel('caption weight')).toBeDisabled();
	await expect(page.getByRole('status')).toHaveText('Saved ✓');

	// A comic in that style gets a caption lettered in it.
	await page.goto('/comics');
	await page.locator('body[data-hydrated]').waitFor();
	await page.keyboard.press('n');
	await page.keyboard.type('Lettered');
	await page.keyboard.press('Tab');
	await arrowTo(page, page.getByRole('radio', { name }));
	await page.keyboard.press('Enter');
	await page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	await waitForEditor(page);
	const comicPath = new URL(page.url()).pathname;
	await page.locator('main [data-panel-id]').first().click();
	await page.keyboard.press('c');
	await page.keyboard.press('Escape');
	const caption = page.locator('main .balloon-text');
	await expect.poll(() => family(caption)).toMatch(/^"Rubik Dirt"/);

	// Its own font wins; "Style — …" hands it back.
	// Typing in the open menu must not reach the editor's shortcuts (B, S… add balloons).
	const font = page.getByRole('button', { name: /^Font: / });
	await expect(font).toHaveAccessibleName(/^Font: Style — Rubik Dirt/);
	await font.click();
	await page.keyboard.type('Bangers');
	await page.keyboard.press('Enter');
	await expect.poll(() => family(caption)).toMatch(/^Bangers/);
	await expect(page.locator('main .balloon-text')).toHaveCount(1);
	await font.click();
	await page.getByRole('option', { name: /^Style — / }).click();
	await expect.poll(() => family(caption)).toMatch(/^"Rubik Dirt"/);

	// Resetting the style re-letters the comic.
	await page.goto(stylePath);
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByRole('button', { name: 'Reset to house default' }).click();
	await expect(page.getByRole('status')).toHaveText('Saved ✓');
	await page.goto(comicPath);
	await waitForEditor(page);
	await expect.poll(() => family(caption)).toMatch(/^Rubik,/);
	await expect(caption).toHaveCSS('font-style', 'italic');
	await expect(caption).toHaveCSS('text-transform', 'uppercase');
});

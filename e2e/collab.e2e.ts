import { expect, test, type Browser } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { openEditor, waitForEditor, waitForLive, newComic } from './support/editor';

/** A separate browser session (its own cookies and connection), signed in as `email`. */
async function session(browser: Browser, email: string) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, email);
	await page.waitForURL('**/comics');
	return { context, page, panels: page.locator('main [data-panel-id]') };
}

test('two editors on one comic see each other’s edits live; offline edits sync later', async ({
	browser
}) => {
	const { email } = await createUser('collab');
	const a = await session(browser, email);
	await newComic(a.page);
	await waitForEditor(a.page);
	await waitForLive(a.page);
	const path = new URL(a.page.url()).pathname;

	const b = await session(browser, email);
	await openEditor(b.page, path);
	await waitForLive(b.page);
	await expect(b.panels).toHaveCount(12);

	// A merges two cells; B's page follows without a reload.
	await a.panels.first().click();
	await a.page.keyboard.press('Shift+ArrowRight');
	await a.page.keyboard.press('m');
	await expect(b.panels).toHaveCount(11);

	// B letters a balloon; A sees the words while B is still typing.
	await b.panels.nth(9).click();
	await b.page.keyboard.press('s');
	await expect(b.page.locator('main .ProseMirror')).toBeFocused();
	await b.page.keyboard.type('LIVE FROM B');
	await expect(a.page.locator('main .balloon-text')).toHaveText('LIVE FROM B');
	await b.page.keyboard.press('Escape');

	// B loses the network and keeps working; A gets the edit once B is back.
	await b.context.setOffline(true);
	await b.panels.nth(3).click();
	await b.page.keyboard.press('Shift+ArrowRight');
	await b.page.keyboard.press('m');
	await expect(b.panels).toHaveCount(10);
	await expect(b.page.getByText('Offline — changes will sync')).toBeVisible();
	await expect(a.panels).toHaveCount(11);
	await b.context.setOffline(false);
	await expect(a.panels).toHaveCount(10);
	await expect(b.page.getByText('Saved', { exact: true })).toBeVisible();

	// Undo on A only undoes A's merge, not B's edits.
	await a.page.locator('[data-canvas]').focus();
	await a.page.keyboard.press('ControlOrMeta+z');
	await expect(a.panels).toHaveCount(11);
	await expect(b.panels).toHaveCount(11);
	await expect(a.page.locator('main .balloon-text')).toHaveText('LIVE FROM B');

	await a.context.close();
	await b.context.close();
});

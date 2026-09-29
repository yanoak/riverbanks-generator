import { expect, test, type Browser, type Page } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { openEditor, waitForEditor, waitForLive, newComic } from './support/editor';

async function session(browser: Browser, email: string) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, email);
	await page.waitForURL('**/comics');
	return { context, page, panels: page.locator('main [data-panel-id]') };
}

const nameOf = (email: string) => email.split('@')[0];

async function invite(page: Page, email: string) {
	await page.getByRole('button', { name: 'Share' }).click();
	await page.getByPlaceholder('Invite by email').fill(email);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('list', { name: 'People with access' })).toContainText(email);
	await page.keyboard.press('Escape');
}

test('people see each other, their selections and carets; a moving balloon is held', async ({
	browser
}) => {
	const [ownerAccount, editorAccount] = await Promise.all([createUser('own'), createUser('ed')]);
	const [ownerName, editorName] = [nameOf(ownerAccount.email), nameOf(editorAccount.email)];

	const owner = await session(browser, ownerAccount.email);
	await newComic(owner.page);
	await waitForEditor(owner.page);
	await waitForLive(owner.page);
	const path = new URL(owner.page.url()).pathname;
	await invite(owner.page, editorAccount.email);

	const editor = await session(browser, editorAccount.email);
	await openEditor(editor.page, path);
	await waitForLive(editor.page);

	// Avatars: each sees the other, and where they are.
	const avatars = (p: Page) => p.getByRole('list', { name: 'Also here' });
	await expect(avatars(owner.page).getByRole('button')).toHaveAccessibleName(
		`${editorName} — page 1`
	);
	await expect(avatars(editor.page).getByRole('button')).toHaveAccessibleName(
		new RegExp(`^${ownerName} — page 1`)
	);

	// A selection shows on the other screen, labelled with the selector's name.
	await editor.panels.nth(5).click();
	await expect(owner.page.locator('[data-peer-label]', { hasText: editorName })).toBeVisible();

	// The owner adds a balloon; the editor gets it.
	await owner.panels.first().click();
	await owner.page.keyboard.press('s');
	await expect(owner.page.locator('main .ProseMirror')).toBeFocused();
	await owner.page.keyboard.type('HELD');
	await owner.page.keyboard.press('Escape');
	const balloonOnOwner = owner.page.locator('main [data-element-id]').filter({ hasText: 'HELD' });
	const balloonOnEditor = editor.page.locator('main [data-element-id]').filter({ hasText: 'HELD' });
	await expect(balloonOnEditor).toBeVisible();

	// Owner starts dragging it and holds on; the editor sees who has it and cannot nudge it.
	const box = (await balloonOnOwner.boundingBox())!;
	await owner.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await owner.page.mouse.down();
	for (let i = 1; i <= 5; i++) {
		await owner.page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2);
	}
	await expect(
		editor.page.locator('[data-peer-label]', { hasText: `${ownerName} is moving this` })
	).toBeVisible();
	const leftBefore = await balloonOnEditor.evaluate((el) => (el as HTMLElement).style.left);
	await balloonOnEditor.click();
	await editor.page.keyboard.press('ArrowRight');
	await expect(editor.page.getByRole('status')).toHaveText(`${ownerName} is moving this balloon.`);

	// Let go: the hold clears, the move lands for both, and the editor can nudge again.
	await owner.page.mouse.up();
	await expect(editor.page.locator('[data-peer-label]', { hasText: 'is moving this' })).toHaveCount(
		0
	);
	await expect
		.poll(() => balloonOnEditor.evaluate((el) => (el as HTMLElement).style.left))
		.not.toBe(leftBefore);
	await balloonOnEditor.click();
	await editor.page.keyboard.press('ArrowRight');
	await expect(editor.page.getByRole('status')).toHaveCount(0);

	// Carets: while the editor types in the balloon, the owner sees their named caret.
	await owner.page.locator('[data-canvas]').focus();
	await balloonOnOwner.dblclick();
	await expect(owner.page.locator('main .ProseMirror')).toBeFocused();
	await balloonOnEditor.dblclick();
	await expect(editor.page.locator('main .ProseMirror')).toBeFocused();
	await editor.page.keyboard.press('End');
	await editor.page.keyboard.type('!');
	await expect(
		owner.page.locator('.collaboration-carets__label', { hasText: editorName })
	).toBeVisible();

	// A vanished session (closed without cleanup, as when a laptop sleeps) drops out after
	// the 5 s presence timeout.
	await editor.context.close();
	await expect(avatars(owner.page)).toHaveCount(0, { timeout: 10_000 });
	await owner.context.close();
});

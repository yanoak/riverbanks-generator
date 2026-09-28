import { expect, test, type Browser } from '@playwright/test';
import { createUser, signIn } from './support/accounts';
import { openEditor, waitForEditor, waitForLive } from './support/editor';

async function session(browser: Browser, email: string) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, email);
	await page.waitForURL('**/comics');
	return { context, page, panels: page.locator('main [data-panel-id]') };
}

test('share a comic by email, edit it together, then remove access', async ({ browser }) => {
	const [ownerAccount, editorAccount] = await Promise.all([
		createUser('owner'),
		createUser('editor')
	]);
	const owner = await session(browser, ownerAccount.email);
	await owner.page.getByRole('button', { name: '+ New comic' }).click();
	await owner.page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	await waitForEditor(owner.page);
	await waitForLive(owner.page);
	const path = new URL(owner.page.url()).pathname;

	// Invite, by keyboard: focus starts in the email field; a wrong email explains itself.
	await owner.page.getByRole('button', { name: 'Share' }).click();
	const dialog = owner.page.getByRole('dialog', { name: /Share/ });
	const email = dialog.getByPlaceholder('Invite by email');
	await expect(email).toBeFocused();
	await email.fill('nobody@test.local');
	await owner.page.keyboard.press('Enter');
	await expect(dialog.getByRole('alert')).toHaveText(/No Riverbanks account with that email/);
	await email.fill(editorAccount.email);
	await owner.page.keyboard.press('Enter');
	await expect(dialog.getByRole('list', { name: 'People with access' })).toContainText(
		editorAccount.email
	);
	await expect(email).toBeFocused();
	await expect(email).toHaveValue('');
	await owner.page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(owner.page.getByRole('button', { name: 'Share' })).toBeFocused();

	// The editor finds it under "Shared with me" and opens it.
	const editor = await session(browser, editorAccount.email);
	await expect(editor.page.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
	await expect(editor.page.getByText(`Shared by ${ownerAccount.email}`)).toBeVisible();
	await editor.page.getByRole('link', { name: 'Open Untitled comic' }).click();
	await waitForEditor(editor.page);
	await waitForLive(editor.page);

	// Edits flow both ways.
	await owner.panels.first().click();
	await owner.page.keyboard.press('Shift+ArrowRight');
	await owner.page.keyboard.press('m');
	await expect(editor.panels).toHaveCount(11);
	await editor.panels.nth(9).click();
	await editor.page.keyboard.press('s');
	await expect(editor.page.locator('main .ProseMirror')).toBeFocused();
	await editor.page.keyboard.type('FROM THE EDITOR');
	await expect(owner.page.locator('main .balloon-text')).toHaveText('FROM THE EDITOR');
	await editor.page.keyboard.press('Escape');

	// An editor sees who has access but cannot invite; Done has focus; they may leave.
	await editor.page.getByRole('button', { name: 'Share' }).click();
	const theirDialog = editor.page.getByRole('dialog', { name: /Share/ });
	await expect(theirDialog.getByRole('button', { name: 'Done' })).toBeFocused();
	await expect(theirDialog.getByPlaceholder('Invite by email')).toHaveCount(0);
	await expect(theirDialog.getByRole('button', { name: 'Leave comic' })).toBeVisible();
	await editor.page.keyboard.press('Escape');

	// The owner removes them; their next edit sends them back to their list.
	await owner.page.getByRole('button', { name: 'Share' }).click();
	await dialog.getByRole('button', { name: `Remove ${editorAccount.email}` }).click();
	await expect(dialog.getByRole('list', { name: 'People with access' })).not.toContainText(
		editorAccount.email
	);
	await owner.page.keyboard.press('Escape');

	await editor.panels.nth(3).click();
	await editor.page.keyboard.press('Shift+ArrowRight');
	await editor.page.keyboard.press('m');
	await editor.page.waitForURL('**/comics?notice=no-access');
	await expect(editor.page.getByText('You no longer have access to that comic.')).toBeVisible();
	await expect(editor.page.getByRole('heading', { name: 'Shared with me' })).toHaveCount(0);

	// And the owner's comic never took the removed editor's last edit.
	await openEditor(owner.page, path);
	await expect(owner.panels).toHaveCount(11);

	await owner.context.close();
	await editor.context.close();
});

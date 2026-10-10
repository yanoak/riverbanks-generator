import { expect, test } from '@playwright/test';
import { createUser, signIn } from './support/accounts';

test('archive a comic, undo, restore, and delete it forever, by keyboard', async ({ page }) => {
	const { email } = await createUser('archiver');
	await signIn(page, email);
	await page.waitForURL('**/comics');

	await page.keyboard.press('n');
	await page
		.getByRole('dialog', { name: 'New comic' })
		.getByRole('textbox', { name: 'Title' })
		.fill('Old draft');
	await page.keyboard.press('Enter');
	await page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	await page.goto('/comics');

	const main = page.locator('main');
	const card = main.getByRole('listitem').filter({ hasText: 'Old draft' });
	const link = page.getByRole('link', { name: 'Open Old draft' });

	// Archive: the card goes, and focus lands on Undo.
	await card.getByRole('button', { name: 'Archive' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('status')).toHaveText(/Archived “Old draft”\./);
	await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
	await expect(main.getByText('Nothing here but the archive')).toBeVisible();

	// Undo: back in the list, with focus on it.
	await page.keyboard.press('Enter');
	await expect(link).toBeFocused();
	await expect(page.getByText(/Archived \(/)).toHaveCount(0);

	// Archive again, open the archive, restore from there.
	await card.getByRole('button', { name: 'Archive' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
	const summary = page.getByText('Archived (1)');
	await summary.focus();
	await page.keyboard.press('Enter');
	const row = main.getByRole('listitem').filter({ hasText: 'Old draft' });
	await expect(row).toContainText(/1 page · archived \S+ \S+/);
	await row.getByRole('button', { name: 'Restore' }).focus();
	await page.keyboard.press('Enter');
	await expect(link).toBeFocused();
	await expect(summary).toHaveCount(0);

	// Delete forever only from the archive, with a confirmation; Cancel steps back.
	await card.getByRole('button', { name: 'Archive' }).focus();
	await page.keyboard.press('Enter');
	await summary.focus();
	await page.keyboard.press('Enter');
	await row.getByRole('button', { name: 'Delete forever' }).focus();
	await page.keyboard.press('Enter');
	await expect(row.getByRole('button', { name: 'Really delete?' })).toBeFocused();
	await row.getByRole('button', { name: 'Cancel' }).focus();
	await page.keyboard.press('Enter');
	await expect(row.getByRole('button', { name: 'Delete forever' })).toBeFocused();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');
	await expect(summary).toHaveCount(0);
	await expect(page.getByRole('button', { name: '+ New comic' })).toBeFocused();

	await page.reload();
	await expect(page.getByText('Old draft')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { waitForEditor } from './support/editor';
import { createClient } from '@supabase/supabase-js';
import { createUser, PASSWORD, signIn, uniqueEmail } from './support/accounts';

test('an admin-created account signs in, makes a comic, and keeps it across reloads', async ({
	page
}) => {
	const { email } = await createUser('member');
	await page.goto('/');
	await page.getByRole('link', { name: 'Sign in' }).click();
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/comics');
	await expect(page.getByText('No comics yet')).toBeVisible();

	await page.getByRole('button', { name: '+ New comic' }).click();
	await page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	await waitForEditor(page);
	const panels = page.locator('main [data-panel-id]');
	await expect(panels).toHaveCount(12);
	await panels.first().click();
	await page.keyboard.press('Shift+ArrowRight');
	await page.keyboard.press('m');
	await page.keyboard.press('s');
	await expect(page.locator('main .ProseMirror')).toBeFocused();
	await page.keyboard.type('SAVED IN THE CLOUD');
	await page.keyboard.press('Escape');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	await page.reload();
	await waitForEditor(page);
	await expect(panels).toHaveCount(11);
	await expect(page.locator('main .balloon-text')).toHaveText('SAVED IN THE CLOUD');

	await page.goto('/comics');
	await expect(page.getByText('Untitled comic')).toBeVisible();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL('**/login**');
	await page.goto('/comics');
	await expect(page).toHaveURL(/\/login\?redirectTo=%2Fcomics/);
});

test('a wrong password gets a clear message', async ({ page }) => {
	const { email } = await createUser('pw');
	await page.goto('/login');
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('nope nope nope');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toHaveText(/don’t match/);
});

test('public sign-up is refused by Supabase itself, not just hidden', async ({ page }) => {
	const client = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{
			auth: { persistSession: false }
		}
	);
	const { error } = await client.auth.signUp({
		email: uniqueEmail('outsider'),
		password: PASSWORD
	});
	expect(error?.message).toMatch(/not allowed|disabled/i);
	const res = await page.goto('/signup');
	expect(res?.status()).toBe(404);
});

test('another account cannot open my comic', async ({ browser }) => {
	const a = await createUser('owner');
	const b = await createUser('intruder');
	const pa = await (await browser.newContext()).newPage();
	await signIn(pa, a.email);
	await pa.keyboard.press('n');
	await pa.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
	const url = pa.url();

	const pb = await (await browser.newContext()).newPage();
	await signIn(pb, b.email);
	const res = await pb.goto(url);
	expect(res?.status()).toBe(404);
});

test('change password, then sign in with the new one', async ({ page }) => {
	const { email } = await createUser('changer');
	await signIn(page, email);
	await page.getByRole('link', { name: 'Change password' }).click();
	await page.getByLabel(/New password/).fill('a brand new password');
	await page.getByRole('button', { name: 'Save password' }).click();
	await page.waitForURL('**/comics');
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL('**/login**');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('a brand new password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/comics');
});

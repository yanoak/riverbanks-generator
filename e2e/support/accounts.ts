import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

const url = () => process.env.PUBLIC_SUPABASE_URL!;

export const uniqueEmail = (label: string) =>
	`${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
export const PASSWORD = 'correct horse battery';

/** A confirmed user created with the local service key (skips the email round-trip). */
export async function createUser(label: string) {
	const admin = createClient(url(), process.env.SUPABASE_TEST_SECRET_KEY!, {
		auth: { persistSession: false }
	});
	const email = uniqueEmail(label);
	const { data, error } = await admin.auth.admin.createUser({
		email,
		password: PASSWORD,
		email_confirm: true
	});
	if (error) throw error;
	return { email, id: data.user.id };
}

/** An access token for the user, as an OAuth-authorised MCP client would hold. */
export async function accessToken(email: string) {
	const client = createClient(url(), process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
		auth: { persistSession: false }
	});
	const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
	if (error) throw error;
	return data.session!.access_token;
}

export async function signIn(page: Page, email: string) {
	await page.goto('/login');
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/comics');
}

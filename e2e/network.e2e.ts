import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import canon from '../src/lib/network/fixture.json' with { type: 'json' };
import { createUser, signIn } from './support/accounts';

test('the story network: filter by story, walk the ties by keyboard, scrub the years', async ({
	page
}) => {
	// A made-up network standing in for the synced canon.
	const admin = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_TEST_SECRET_KEY!,
		{
			auth: { persistSession: false }
		}
	);
	const { error } = await admin.from('story_network').upsert({ id: 'riverbook', data: canon });
	expect(error).toBeNull();

	// Public: it opens without signing in.
	await page.goto('/network');
	await expect(page.getByRole('heading', { name: 'Story network' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

	const { email } = await createUser('network');
	await signIn(page, email);
	await page.getByRole('link', { name: 'Network' }).click();
	await page.waitForURL('**/network');
	await page.locator('body[data-hydrated]').waitFor();
	await expect(page.getByRole('heading', { name: 'Story network' })).toBeVisible();

	const nodes = page.locator('[data-node]');
	await expect(nodes).toHaveCount(canon.people.length);

	// Hiding The Harbour drops Kit and the Guild (but not Mae, who is also in The Raft).
	await page.getByRole('button', { name: /The Harbour/ }).click();
	await expect(page.locator('[data-node="kit"]')).toHaveCount(0);
	await expect(page.locator('[data-node="mae"]')).toHaveCount(1);
	await page.getByRole('button', { name: /The Harbour/ }).click();
	await expect(nodes).toHaveCount(canon.people.length);

	// Enter on a node selects it; a tie in the panel moves selection and focus to that person.
	await page.locator('[data-node="mae"]').focus();
	await page.keyboard.press('Enter');
	const details = page.getByRole('complementary', { name: 'Details' });
	await expect(details.getByRole('heading', { name: 'Mae' })).toBeVisible();
	await details.getByRole('button', { name: /^Nana Oi/ }).click();
	await expect(details.getByRole('heading', { name: 'Nana Oi' })).toBeVisible();
	await expect(page.locator('[data-node="nana-oi"]')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(details.getByRole('heading')).toHaveCount(0);

	// The year scrubber labels ages and marks the dead.
	const slider = page.getByRole('slider');
	await slider.fill('2060');
	await expect(page.locator('[data-node="mae"]')).toContainText('Mae · 42');
	await expect(page.locator('[data-node="nana-oi"]')).toContainText('Nana Oi †2035');
});

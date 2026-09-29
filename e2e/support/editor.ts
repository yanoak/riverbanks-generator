import { expect, type Page } from '@playwright/test';

/** Open an editor route and wait until it has hydrated and loaded its comic. */
export async function openEditor(page: Page, path: string) {
	await page.goto(path);
	await waitForEditor(page);
}

export async function waitForEditor(page: Page) {
	await expect(page.locator('[data-canvas][data-ready="true"]')).toBeVisible();
}

/** Wait until a cloud comic's editor is receiving live updates. */
export async function waitForLive(page: Page) {
	await expect(page.locator('[data-canvas][data-live="true"]')).toBeVisible();
}

/** From /comics: New comic → Create (no title, no style), then wait for the editor. */
export async function newComic(page: Page) {
	await page.getByRole('button', { name: '+ New comic' }).click();
	await page
		.getByRole('dialog', { name: 'New comic' })
		.getByRole('button', { name: 'Create' })
		.click();
	await page.waitForURL(/\/comics\/[0-9a-f-]{36}$/);
}

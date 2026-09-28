import { expect, type Page } from '@playwright/test';

/** Open an editor route and wait until it has hydrated and loaded its comic. */
export async function openEditor(page: Page, path: string) {
	await page.goto(path);
	await waitForEditor(page);
}

export async function waitForEditor(page: Page) {
	await expect(page.locator('[data-canvas][data-ready="true"]')).toBeVisible();
}

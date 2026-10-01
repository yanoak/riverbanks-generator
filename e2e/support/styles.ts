import { expect, type Locator, type Page } from '@playwright/test';

/**
 * With focus in a style radio group, press `key` until `radio` is checked. Styles are team-wide
 * and listed most recently edited first, so a test running alongside can put its own on top.
 */
export async function arrowTo(page: Page, radio: Locator, key = 'ArrowDown') {
	for (let i = 0; i < 40 && !(await radio.isChecked()); i++) await page.keyboard.press(key);
	await expect(radio).toBeChecked();
}

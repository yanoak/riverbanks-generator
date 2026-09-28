import { expect, test } from '@playwright/test';

const canvas = (page: import('@playwright/test').Page) => page.locator('main');

test('merge by keyboard, letter a balloon, undo and redo', async ({ page }) => {
	await page.goto('/');
	const panels = canvas(page).locator('[data-panel-id]');
	await expect(panels).toHaveCount(12);

	// Select the top-left panel, extend to a 2×2 block with ⇧+arrows, merge with M.
	await panels.first().click();
	await page.keyboard.press('Shift+ArrowRight');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+ArrowLeft');
	await page.keyboard.press('m');
	await expect(panels).toHaveCount(9);
	await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Panel 1 (4 cells)');

	// S adds a speech balloon in the selected panel with its text selected for typing.
	await page.keyboard.press('s');
	const editorBox = canvas(page).locator('.ProseMirror');
	await expect(editorBox).toBeFocused();
	await page.keyboard.type('THE TRICK IS TO NEVER MISTAKE THE MESSAGE');
	await page.keyboard.press('Shift+Alt+ArrowLeft');
	await page.keyboard.press('ControlOrMeta+b');
	await page.keyboard.press('Escape');

	const text = canvas(page).locator('.balloon-text');
	await expect(text).toHaveText('THE TRICK IS TO NEVER MISTAKE THE MESSAGE');
	await expect(text.locator('strong')).toHaveText('MESSAGE');
	await expect(page.locator(':focus')).toHaveAttribute('aria-label', /speech balloon/);

	// The balloon grew to fit the text: the text box does not overflow its balloon.
	const fits = await text.evaluate((el) => {
		const content = el.firstElementChild as HTMLElement | null;
		return !content || content.offsetHeight <= el.clientHeight + 1;
	});
	expect(fits).toBe(true);

	// Undo reverts the text edit (one step), then removes the balloon; redo restores both.
	await page.keyboard.press('ControlOrMeta+z');
	await expect(text).toHaveText('WHAT A DAY!');
	await page.keyboard.press('ControlOrMeta+z');
	await expect(text).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(text).toHaveText('THE TRICK IS TO NEVER MISTAKE THE MESSAGE');
});

test('a non-contiguous merge is refused with a reason', async ({ page }) => {
	await page.goto('/');
	const panels = canvas(page).locator('[data-panel-id]');
	await panels.nth(0).click();
	await panels.nth(5).click({ modifiers: ['Shift'] });
	await page.keyboard.press('m');
	await expect(page.getByRole('status')).toHaveText(/share an edge/);
	await expect(panels).toHaveCount(12);
});

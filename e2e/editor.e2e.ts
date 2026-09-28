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

	// Autosave to IndexedDB, then a reload brings everything back.
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.reload();
	await expect(panels).toHaveCount(9);
	await expect(text).toHaveText('THE TRICK IS TO NEVER MISTAKE THE MESSAGE');
	await expect(text.locator('strong')).toHaveText('MESSAGE');
});

test('pages: add, reorder, delete, and persist', async ({ page }) => {
	await page.goto('/');
	const thumbs = page.getByRole('navigation', { name: 'Pages' }).getByRole('button', {
		name: /^Page \d+$/
	});
	await expect(thumbs).toHaveCount(1);
	await page.getByRole('button', { name: 'Add page' }).click();
	await page.getByRole('button', { name: 'Add page' }).click();
	await expect(thumbs).toHaveCount(3);
	await expect(thumbs.nth(2)).toHaveAttribute('aria-current', 'page');

	// Put a caption on page 3, move it to position 2, and check it travelled.
	await page.keyboard.press('c');
	await page.keyboard.press('Escape');
	await page.keyboard.press('Alt+PageUp');
	await expect(thumbs.nth(1)).toHaveAttribute('aria-current', 'page');
	await expect(page.locator('main .balloon-text')).toHaveCount(1);

	await page.getByRole('button', { name: 'Delete page' }).click();
	await expect(thumbs).toHaveCount(2);
	await page.keyboard.press('ControlOrMeta+z');
	await expect(thumbs).toHaveCount(3);

	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.reload();
	await expect(thumbs).toHaveCount(3);
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

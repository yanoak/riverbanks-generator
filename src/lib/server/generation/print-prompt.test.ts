import { describe, expect, it } from 'vitest';
import { PRINT_PROMPT, printPrompt } from './print-prompt';

describe('printPrompt', () => {
	it('keeps lettering already in the image instead of forbidding all text', () => {
		// "Do not add any text" read as "remove the text": PAO:1:7 lost DRAFT US A PLAN.
		expect(PRINT_PROMPT).toMatch(/letter for letter/);
		expect(PRINT_PROMPT).not.toMatch(/do not add any text/i);
	});

	it('forbids recolouring, and names the palette only to match hues', () => {
		// "They come from this palette" snapped PAO:1:4's brown floodwater to river teal.
		const p = printPrompt(['#2E6B67 (river teal)', '#8A6A48 (silt brown)']);
		expect(p.startsWith(PRINT_PROMPT)).toBe(true);
		expect(p).toContain('#2E6B67 (river teal)');
		expect(p).toMatch(/do not recolou?r/i);
		expect(p).not.toMatch(/they come from this palette/i);
	});

	it('is the bare prompt when the style has no palette', () => {
		expect(printPrompt([])).toBe(PRINT_PROMPT);
	});
});

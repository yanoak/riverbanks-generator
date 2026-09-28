import { describe, expect, it } from 'vitest';
import { createPage } from './factory';
import { checkPage } from './invariants';
import type { GridPanel } from './types';

describe('checkPage', () => {
	it('passes a fresh page', () => {
		expect(checkPage(createPage())).toEqual([]);
	});

	it('flags a cell claimed by two panels', () => {
		const page = createPage();
		(page.panels[0] as GridPanel).cells.push(1);
		expect(checkPage(page)).toContainEqual(expect.stringMatching(/cell 1 .*2 panels/));
	});

	it('flags a missing cell', () => {
		const page = createPage();
		page.panels.splice(3, 1);
		expect(checkPage(page)).toContainEqual(expect.stringMatching(/cell 3 .*no panel/));
	});

	it('flags an invalid panel shape', () => {
		const page = createPage();
		const [a, , , , , b] = page.panels as GridPanel[];
		a.cells = [0, 5];
		page.panels = page.panels.filter((p) => p !== b);
		expect(checkPage(page)).toContainEqual(expect.stringMatching(/not-contiguous/));
	});
});

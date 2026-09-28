import { describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import { Editor } from './editor.svelte';

describe('Editor pages', () => {
	it('adds a page after the current one and shows it', () => {
		const editor = new Editor();
		const first = editor.page.id;
		editor.addPage();
		expect(editor.comic.pages).toHaveLength(2);
		expect(editor.pageIndex).toBe(1);
		expect(editor.comic.pages[0].id).toBe(first);
	});

	it('undoing an add while on the new page falls back to a valid page', () => {
		const editor = new Editor();
		editor.addPage();
		editor.undo();
		expect(editor.comic.pages).toHaveLength(1);
		expect(editor.pageIndex).toBe(0);
	});

	it('deletes the current page but never the last one', () => {
		const editor = new Editor();
		editor.deletePage();
		expect(editor.comic.pages).toHaveLength(1);
		expect(editor.status).toMatch(/last page/);
		editor.addPage();
		const second = editor.page.id;
		editor.deletePage();
		expect(editor.comic.pages.map((p) => p.id)).not.toContain(second);
		editor.undo();
		expect(editor.comic.pages[1].id).toBe(second);
	});

	it('moves the current page and follows it', () => {
		const editor = new Editor();
		const first = editor.page.id;
		editor.addPage();
		editor.goToPage(0);
		editor.movePage(1);
		expect(editor.comic.pages[1].id).toBe(first);
		expect(editor.pageIndex).toBe(1);
		editor.movePage(1); // already last: no-op
		expect(editor.pageIndex).toBe(1);
	});
});

describe('Editor.load', () => {
	it('replaces the comic and clears history', () => {
		const editor = new Editor();
		editor.addPage();
		const comic = createComic('Loaded');
		editor.load(comic);
		expect(editor.comic.title).toBe('Loaded');
		expect(editor.history.canUndo).toBe(false);
		expect(editor.pageIndex).toBe(0);
	});
});

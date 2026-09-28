import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { clone } from '$lib/model/clone';
import { createComic } from '$lib/model/factory';
import type { Comic } from '$lib/model/types';
import { applyComic, projectComic } from '$lib/model/ydoc';
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

/** A second client on the same comic; changes flow to the editor when sync() is called. */
function collaborator(editor: Editor) {
	const doc = new Y.Doc();
	Y.applyUpdate(doc, Y.encodeStateAsUpdate(editor.doc));
	const sync = () => {
		Y.applyUpdate(
			editor.doc,
			Y.encodeStateAsUpdate(doc, Y.encodeStateVector(editor.doc)),
			'remote'
		);
		Y.applyUpdate(doc, Y.encodeStateAsUpdate(editor.doc, Y.encodeStateVector(doc)), 'remote');
	};
	const edit = (fn: (draft: Comic) => void) => {
		const before = projectComic(doc);
		const after = clone(before);
		fn(after);
		applyComic(doc, before, after, 'them');
	};
	return { doc, sync, edit };
}

const cellPanel = (editor: Editor, cell: number) =>
	editor.page.panels.find((p) => p.kind === 'grid' && p.cells.includes(cell))!;

describe('Editor commands on the Y.Doc', () => {
	it('each command is one undo step with its description, even when it touches many cells', () => {
		const editor = new Editor();
		editor.select({ kind: 'panels', ids: [0, 1, 4, 5].map((c) => cellPanel(editor, c).id) });
		editor.merge();
		editor.splash();
		expect(editor.history.undoCount).toBe(2);
		expect(editor.history.lastCommandDescription).toBe('Full-page panel');
		editor.undo();
		expect(editor.page.panels).toHaveLength(9);
		editor.undo();
		expect(editor.page.panels).toHaveLength(12);
		editor.redo();
		expect(editor.page.panels).toHaveLength(9);
	});

	it('explains a refusal and records nothing', () => {
		const editor = new Editor();
		editor.select({ kind: 'panels', ids: [0, 5].map((c) => cellPanel(editor, c).id) });
		editor.merge();
		expect(editor.status).toMatch(/share an edge/);
		expect(editor.history.undoCount).toBe(0);
	});

	it('a live drag is committed as one step and undoes to where it started', () => {
		const editor = new Editor();
		const id = editor.addBalloon('speech');
		editor.stopEditing();
		const b = editor.page.balloons.find((x) => x.id === id)!;
		const start = { x: b.x, y: b.y, w: b.w, h: b.h };
		Object.assign(b, { x: 10, y: 20, w: 300, h: 200 }); // what Transformer does while dragging
		editor.commitGeometry(b, start, 'Resize balloon');
		expect(editor.history.lastCommandDescription).toBe('Resize balloon');
		editor.undo();
		const after = editor.page.balloons.find((x) => x.id === id)!;
		expect(after).toBe(b); // same live object, reconciled in place
		expect({ x: b.x, y: b.y, w: b.w, h: b.h }).toEqual(start);
	});

	it('a click without movement records nothing', () => {
		const editor = new Editor();
		const panel = editor.page.panels[0];
		editor.commit('Move panel', panel, { image: panel.image });
		expect(editor.history.undoCount).toBe(0);
	});

	it("undo reverts only this editor's changes", () => {
		const editor = new Editor();
		const them = collaborator(editor);
		editor.addFreePanel();
		them.edit((d) => (d.title = 'Their title'));
		them.sync();
		expect(editor.comic.title).toBe('Their title');
		editor.undo();
		expect(editor.page.panels.filter((p) => p.kind === 'free')).toHaveLength(0);
		expect(editor.comic.title).toBe('Their title');
		expect(editor.history.canUndo).toBe(false);
	});

	it('undo skips a step a collaborator fully overwrote and undoes the one before', () => {
		const editor = new Editor();
		const them = collaborator(editor);
		const id = editor.addFreePanel();
		editor.addPage(); // an unrelated earlier step
		editor.goToPage(0);
		editor.select({ kind: 'panels', ids: [id] });
		editor.nudge(10, 0);
		them.sync();
		them.edit((d) => ((d.pages[0].panels.find((p) => p.id === id) as { x: number }).x = 5));
		them.sync();
		editor.undo(); // the nudge has nothing left to undo, so this undoes "Add page"
		expect(editor.comic.pages).toHaveLength(1);
		expect((editor.page.panels.find((p) => p.id === id) as { x: number }).x).toBe(5);
	});

	it('a collaborator deleting the selected balloon clears the selection', () => {
		const editor = new Editor();
		const them = collaborator(editor);
		const id = editor.addBalloon('caption');
		them.sync();
		expect(editor.selection).toEqual({ kind: 'balloon', id });
		them.edit((d) => (d.pages[0].balloons = []));
		them.sync();
		expect(editor.selection).toEqual({ kind: 'none' });
		expect(editor.mode).toBe('select');
	});

	it('keeps the live objects of untouched panels when a collaborator edits elsewhere', () => {
		const editor = new Editor();
		const them = collaborator(editor);
		const first = editor.page.panels[0];
		them.edit((d) => (d.pages[0].panels[5].fill = '#ff0000'));
		them.sync();
		expect(editor.page.panels[0]).toBe(first);
		expect(editor.page.panels[5].fill).toBe('#ff0000');
	});

	it('renaming updates the title without an undo step', () => {
		const editor = new Editor();
		editor.setTitle('  New name ');
		expect(editor.comic.title).toBe('New name');
		expect(editor.history.canUndo).toBe(false);
	});
});

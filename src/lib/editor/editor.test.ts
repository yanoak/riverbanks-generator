import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { clone } from '$lib/model/clone';
import { createComic } from '$lib/model/factory';
import type { Comic, FreePanel } from '$lib/model/types';
import { Presence } from '$lib/collab/presence.svelte';
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

describe('Editor soft hold (someone else is moving it)', () => {
	// Presence sends at most every 100 ms; tests step through that window.
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	const flush = () => vi.advanceTimersByTime(100);
	/** An editor plus another person's presence, wired together. */
	function withOther() {
		const editor = new Editor();
		const mine = new Presence(editor.doc, { id: 'me', name: 'me', color: '#000' }, Date.now, {
			timers: false
		});
		const theirs = new Presence(new Y.Doc(), { id: 'ak', name: 'ak', color: '#f00' }, Date.now, {
			timers: false
		});
		mine.onsend = (u) => theirs.receive(u);
		theirs.onsend = (u) => mine.receive(u);
		mine.receive(theirs.encodeLocal());
		theirs.receive(mine.encodeLocal());
		editor.presence = mine;
		return { editor, theirs };
	}

	it('refuses to nudge, reorder or delete what someone else is moving, and says who', () => {
		const { editor, theirs } = withOther();
		const id = editor.addBalloon('speech');
		editor.stopEditing();
		const b = () => editor.page.balloons.find((x) => x.id === id);
		const before = { x: b()!.x, z: b()!.z };
		theirs.claim(id, b()!);

		expect(editor.nudge(10, 0)).toBe(true); // handled (so the key does nothing else)
		expect(editor.status).toBe('ak is moving this balloon.');
		editor.reorder('front');
		editor.deleteSelection();
		expect(b()).toMatchObject(before);
		expect(editor.history.lastCommandDescription).toBe('Add speech');

		// Selecting it and editing its text still work.
		expect(editor.startEditing(id)).toBe(true);
	});

	it('a drag cannot start on a held object; it can once they let go', () => {
		const { editor, theirs } = withOther();
		const id = editor.addFreePanel();
		const panel = editor.page.panels.find((p) => p.id === id) as FreePanel;
		theirs.claim(id, panel);
		expect(editor.beginMove(id, panel)).toBe(false);
		expect(editor.status).toBe('ak is moving this panel.');
		theirs.release();
		flush();
		expect(editor.beginMove(id, panel)).toBe(true);
		flush();
		expect(theirs.heldBy(id)?.user.name).toBe('me');
		editor.endMove();
		flush();
		expect(theirs.heldBy(id)).toBeNull();
	});

	it('losing a simultaneous grab cancels the drag and says who got there first', () => {
		const { editor, theirs } = withOther();
		const id = editor.addFreePanel();
		const panel = editor.page.panels.find((p) => p.id === id) as FreePanel;
		const start = { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
		// They grabbed it a moment earlier, but their claim arrives after ours began.
		const send = theirs.onsend;
		theirs.onsend = null;
		theirs.set({ moving: { id, since: Date.now() - 50, rect: start } });
		expect(editor.beginMove(id, start)).toBe(true);
		theirs.onsend = send;
		flush();
		theirs.heartbeat();
		expect(editor.stillMoving(id)).toBe(false);
		expect(editor.status).toBe('ak got there first.');
	});

	it('my own claim never blocks me', () => {
		const { editor } = withOther();
		const id = editor.addFreePanel();
		const panel = editor.page.panels.find((p) => p.id === id) as FreePanel;
		expect(editor.beginMove(id, panel)).toBe(true);
		expect(editor.nudge(5, 0)).toBe(true);
		expect(editor.status).toBeNull();
	});
});

describe('Editor.setStyle', () => {
	it('sets and clears the comic’s style as one undoable step', () => {
		const editor = new Editor();
		editor.setStyle('style-1');
		expect(editor.comic.styleProfileId).toBe('style-1');
		editor.setStyle('style-1'); // unchanged: no extra step
		editor.setStyle(undefined);
		expect(editor.comic.styleProfileId).toBeUndefined();
		editor.undo();
		expect(editor.comic.styleProfileId).toBe('style-1');
		editor.undo();
		expect(editor.comic.styleProfileId).toBeUndefined();
	});
});

describe('Editor.placeStoredImage', () => {
	const stored = { assetId: 'gen-1', naturalWidth: 1600, naturalHeight: 900 };

	it('fills the panel, on whatever page it is, with its prompt, as one undo step', () => {
		const editor = new Editor();
		const panelId = editor.page.panels[0].id;
		editor.addPage();
		expect(editor.pageIndex).toBe(1);
		expect(editor.placeStoredImage(panelId, stored, { prompt: 'a heron' })).toBe(true);
		const panel = editor.comic.pages[0].panels.find((p) => p.id === panelId)!;
		expect(panel.image).toMatchObject({ assetId: 'gen-1', naturalWidth: 1600 });
		expect(panel.image!.scale).toBeGreaterThan(0);
		expect(panel.prompt).toBe('a heron');
		editor.undo();
		const undone = editor.comic.pages[0].panels.find((p) => p.id === panelId)!;
		expect(undone.image).toBeUndefined();
		expect(undone.prompt).toBeUndefined();
	});

	it('a panel that has gone is reported, not an error', () => {
		const editor = new Editor();
		expect(editor.placeStoredImage('gone', stored)).toBe(false);
	});
});

describe('Editor.placePrintVersion', () => {
	it('swaps in the larger image with the same framing, as one undo step', () => {
		const editor = new Editor();
		const panelId = editor.page.panels[0].id;
		editor.placeStoredImage(panelId, { assetId: 'draft', naturalWidth: 512, naturalHeight: 288 });
		editor.patch('Pan', panelId, {
			image: { ...editor.page.panels[0].image!, offsetX: -30, offsetY: -10, scale: 1.5 }
		});

		expect(
			editor.placePrintVersion(panelId, 'draft', {
				assetId: 'print',
				naturalWidth: 4096,
				naturalHeight: 2304
			})
		).toBe(true);
		const image = editor.page.panels[0].image!;
		expect(image).toEqual({
			assetId: 'print',
			naturalWidth: 4096,
			naturalHeight: 2304,
			offsetX: -30,
			offsetY: -10,
			scale: 1.5 * (512 / 4096)
		});
		editor.undo();
		expect(editor.page.panels[0].image!.assetId).toBe('draft');
	});

	it('does nothing if the panel moved on to another image meanwhile', () => {
		const editor = new Editor();
		const panelId = editor.page.panels[0].id;
		editor.placeStoredImage(panelId, { assetId: 'other', naturalWidth: 10, naturalHeight: 10 });
		expect(
			editor.placePrintVersion(panelId, 'draft', {
				assetId: 'print',
				naturalWidth: 40,
				naturalHeight: 40
			})
		).toBe(false);
		expect(editor.page.panels[0].image!.assetId).toBe('other');
	});
});

describe('Editor header and footer bands', () => {
	function boards() {
		const editor = new Editor();
		editor.load(createComic('Taming Currents', 'board'));
		editor.addPage();
		editor.goToPage(0);
		return editor;
	}

	it('selects a band, and drops the selection on a page without one', () => {
		const editor = boards();
		editor.selectBand('header');
		expect(editor.selection).toEqual({ kind: 'band', band: 'header' });
		const old = new Editor();
		old.load(createComic('Old'));
		old.selectBand('footer');
		expect(old.selection).toEqual({ kind: 'none' });
	});

	it('edits this page’s band text as one undo step', () => {
		const editor = boards();
		editor.setBandText('header', 'subtitle', 'The Invitation');
		expect(editor.bands.header.subtitle).toBe('The Invitation');
		expect(editor.comic.pages[1].bands).toBeUndefined();
		editor.undo();
		expect(editor.bands.header.subtitle).toBe('');
	});

	it('typing the default back drops the override', () => {
		const editor = boards();
		editor.setBandText('header', 'title', 'Mine');
		editor.setBandText('header', 'title', '{comic}');
		expect(editor.page.bands).toBeUndefined();
	});

	it('uses a page’s band on every page, and resets a page to the default', () => {
		const editor = boards();
		editor.setBandText('header', 'title', 'ACT TWO');
		editor.useBandOnEveryPage('header');
		expect(editor.comic.bands?.header.title).toBe('ACT TWO');
		expect(editor.page.bands).toBeUndefined();
		editor.goToPage(1);
		expect(editor.bands.header.title).toBe('ACT TWO');
		editor.setBandText('header', 'title', 'ELSEWHERE');
		editor.resetBand('header');
		expect(editor.bands.header.title).toBe('ACT TWO');
	});
});

describe('Editor anchored balloons', () => {
	function setup() {
		const editor = new Editor();
		editor.load(createComic('Anchors', 'board'));
		editor.addBalloon('speech');
		editor.stopEditing();
		const id = editor.page.balloons[0].id;
		editor.select({ kind: 'balloon', id });
		return { editor, id, balloon: () => editor.page.balloons[0] };
	}

	it('anchors to a corner of the panel under the balloon, and lets go', () => {
		const { editor, balloon } = setup();
		const under = editor.anchorPanel()!;
		editor.setAnchor('tl');
		expect(balloon().anchor).toEqual({ panelId: under.id, corner: 'tl' });
		editor.setAnchor(null);
		expect(balloon().anchor).toBeUndefined();
		editor.undo();
		expect(balloon().anchor?.corner).toBe('tl');
	});

	it('a drag lets go of the corner in the same undo step; a resize keeps it', () => {
		const { editor, balloon } = setup();
		editor.setAnchor('br');
		const pinned = { ...balloon() };
		const b = balloon();
		const before = { x: b.x, y: b.y, w: b.w, h: b.h };
		b.w += 40; // resize from the right
		editor.commitGeometry(b, before, 'Resize balloon');
		expect(balloon().anchor?.corner).toBe('br');
		// Still in its corner: a wider balloon overhangs a little more (0.293 of the extra half-width).
		expect(balloon().x + balloon().w).toBeCloseTo(pinned.x + pinned.w + 0.293 * 20, 6);

		const moved = balloon();
		const at = { x: moved.x, y: moved.y, w: moved.w, h: moved.h };
		moved.x -= 100;
		editor.commitGeometry(moved, at, 'Move balloon');
		expect(balloon().anchor).toBeUndefined();
		editor.undo();
		expect(balloon().anchor?.corner).toBe('br');
		expect(balloon().x).toBeCloseTo(at.x, 6);
	});

	it('re-seats in its corner when its roundness changes', () => {
		const { editor, balloon, id } = setup();
		editor.setAnchor('tl');
		const x = balloon().x;
		editor.patch('Roundness', id, { roundness: 0 });
		expect(balloon().x).toBeGreaterThan(x); // a box overhangs by its stroke only
	});

	it('a nudge lets go too', () => {
		const { editor, balloon } = setup();
		editor.setAnchor('tl');
		editor.nudge(1, 0);
		expect(balloon().anchor).toBeUndefined();
	});
});

describe('Editor connected balloons', () => {
	it('connects, switches to a line, refuses a loop, and unlinks on delete', () => {
		const editor = new Editor();
		editor.load(createComic('Chains', 'board'));
		const ids = [0, 1].map(() => {
			const id = editor.addBalloon('speech');
			editor.stopEditing();
			return id;
		});
		editor.select({ kind: 'balloon', id: ids[0] });
		editor.setNext(ids[1]);
		editor.setConnector('line');
		const first = () => editor.page.balloons.find((b) => b.id === ids[0])!;
		expect(first()).toMatchObject({ next: ids[1], connector: 'line' });

		editor.select({ kind: 'balloon', id: ids[1] });
		editor.setNext(ids[0]);
		expect(editor.status).toMatch(/loop/);
		expect(editor.page.balloons.find((b) => b.id === ids[1])).not.toHaveProperty('next');

		editor.deleteSelection();
		expect(first()).not.toHaveProperty('next');
		editor.undo();
		expect(first().next).toBe(ids[1]);
	});
});

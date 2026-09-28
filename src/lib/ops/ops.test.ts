import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { clone } from '$lib/model/clone';
import { createComic } from '$lib/model/factory';
import { gridPanels } from '$lib/model/invariants';
import type { Comic, GridPanel } from '$lib/model/types';
import { applyComic, projectComic } from '$lib/model/ydoc';
import { mergePanels } from './comic-ops';
import { MemoryStore } from './memory-store';
import { loadComic, mutateComic, OpError } from './ops';
import { compactDoc, initialState, openDoc } from './ydoc-store';

async function seed(store: MemoryStore, comic = createComic('Seed')) {
	return store.create(comic.title, comic, initialState(comic));
}

/** What an open editor does: edit its own copy and append the difference. */
async function editorEdit(store: MemoryStore, id: string, change: (c: Comic) => void) {
	const opened = (await openDoc(store, id))!;
	const before = projectComic(opened.doc);
	const after = clone(before);
	change(after);
	const base = Y.encodeStateVector(opened.doc);
	applyComic(opened.doc, before, after, 'editor');
	return store.append(id, Y.encodeStateAsUpdate(opened.doc, base));
}

describe('mutateComic', () => {
	it('applies a change as one appended update and refreshes the stored projection', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		const result = await mutateComic(store, rec.id, (comic) => {
			comic.title = 'Renamed';
			return 'renamed';
		});
		expect(result.summary).toBe('renamed');
		expect(result.rev).toBeGreaterThan(0);
		const saved = await store.get(rec.id);
		expect(saved?.title).toBe('Renamed');
		expect((saved?.doc as Comic).title).toBe('Renamed');
		// Compacted: the snapshot holds it, the log is empty again.
		expect((await store.state(rec.id))?.updates).toEqual([]);
		expect((await loadComic(store, rec.id)).record.rev).toBe(result.rev);
	});

	it('rejects a change that breaks the grid invariant and writes nothing', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		await expect(
			mutateComic(store, rec.id, (comic) => {
				(comic.pages[0].panels[0] as GridPanel).cells.push(1); // cell 1 now claimed twice
				return 'broken';
			})
		).rejects.toThrow(/claimed by 2 panels/);
		const state = await store.state(rec.id);
		expect([state?.updates.length, state?.snapshotRev]).toEqual([0, 1]);
	});

	it('writes nothing when the change changes nothing', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		await mutateComic(store, rec.id, () => 'no-op');
		expect((await store.state(rec.id))?.snapshotRev).toBe(1);
	});

	it('merges with an edit the open editor made meanwhile, instead of conflicting', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		await editorEdit(store, rec.id, (c) => (c.pages[0].panels[3].fill = '#abcdef'));
		await mutateComic(store, rec.id, (comic) => mergePanels(comic, { page: 1, cells: [0, 1] }));
		const { comic } = await loadComic(store, rec.id);
		expect(gridPanels(comic.pages[0])).toHaveLength(11);
		expect(comic.pages[0].panels.find((p) => p.fill === '#abcdef')).toBeDefined();
	});

	it('reports a missing comic as not-found', async () => {
		await expect(mutateComic(new MemoryStore(), 'nope', () => '')).rejects.toMatchObject({
			code: 'not-found'
		});
	});
});

describe('openDoc', () => {
	it('converts a pre-Yjs comic once; a second opener uses the same conversion', async () => {
		const store = new MemoryStore();
		const legacy = createComic('Old');
		const id = store.createLegacy(legacy);
		const first = (await openDoc(store, id))!;
		const second = (await openDoc(store, id))!;
		expect(projectComic(first.doc).title).toBe('Old');
		expect(Y.encodeStateVector(second.doc)).toEqual(Y.encodeStateVector(first.doc));
		expect(projectComic(first.doc).pages[0].panels.map((p) => p.id)).toEqual(
			legacy.pages[0].panels.map((p) => p.id)
		);
	});

	it('a converted comic continues its old revision instead of starting over', async () => {
		const store = new MemoryStore();
		const id = store.createLegacy(createComic('Old'), 54);
		expect((await loadComic(store, id)).record.rev).toBe(54);
		const { rev } = await mutateComic(store, id, (c) => ((c.title = 'Newer'), 'renamed'));
		expect(rev).toBe(55);
		expect((await loadComic(store, id)).record.rev).toBe(55);
	});

	it('two first-openers racing: the loser adopts the winner’s snapshot', async () => {
		const store = new MemoryStore();
		const id = store.createLegacy(createComic('Race'));
		const [a, b] = await Promise.all([openDoc(store, id), openDoc(store, id)]);
		const stored = (await store.state(id))!.snapshot!;
		const fromStore = new Y.Doc();
		Y.applyUpdate(fromStore, stored);
		for (const opened of [a!, b!]) {
			expect(Y.encodeStateVector(opened.doc)).toEqual(Y.encodeStateVector(fromStore));
		}
	});
});

describe('compactDoc', () => {
	it('loses the race to another compaction, merges it, and wins the retry', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		const slow = (await openDoc(store, rec.id))!;
		await editorEdit(store, rec.id, (c) => (c.title = 'From elsewhere'));
		const fast = (await openDoc(store, rec.id))!;
		expect(await compactDoc(store, rec.id, fast)).toBe(true);
		// `slow` never saw the title change, and its base snapshot is gone.
		expect(await compactDoc(store, rec.id, slow)).toBe(true);
		expect(projectComic(slow.doc).title).toBe('From elsewhere');
		expect((await store.get(rec.id))?.title).toBe('From elsewhere');
	});

	it('never deletes an update it did not apply, even one with a lower id', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		// A writer takes id N but commits after N+1 is visible.
		const late = store.reserveUpdateId();
		await editorEdit(store, rec.id, (c) => (c.pages[0].panels[0].fill = '#111111'));
		const opened = (await openDoc(store, rec.id))!;
		expect(await compactDoc(store, rec.id, opened)).toBe(true);

		const other = (await openDoc(store, rec.id))!;
		const before = projectComic(other.doc);
		const after = clone(before);
		after.pages[0].panels[1].fill = '#222222';
		const base = Y.encodeStateVector(other.doc);
		applyComic(other.doc, before, after, 'late');
		store.commitReserved(late, rec.id, Y.encodeStateAsUpdate(other.doc, base));

		const reopened = projectComic((await openDoc(store, rec.id))!.doc);
		expect(reopened.pages[0].panels.slice(0, 2).map((p) => p.fill)).toEqual(['#111111', '#222222']);
	});
});

describe('comic ops', () => {
	it('merge by cells returns the editor’s refusal text for bad shapes', async () => {
		const comic = createComic();
		expect(() => mergePanels(comic, { page: 1, cells: [0, 5] })).toThrow(OpError);
		expect(() => mergePanels(comic, { page: 1, cells: [0, 5] })).toThrow(/share an edge/);
		const summary = mergePanels(comic, { page: 1, cells: [0, 1, 4, 5] });
		expect(summary).toMatch(/Merged 4 cells/);
		expect(comic.pages[0].panels).toHaveLength(9);
	});

	it('rejects a page number out of range', () => {
		expect(() => mergePanels(createComic(), { page: 3, cells: [0, 1] })).toThrow(/no page 3/i);
	});
});

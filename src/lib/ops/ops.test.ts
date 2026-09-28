import { describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import { serialize } from '$lib/model/serialize';
import type { Comic, GridPanel } from '$lib/model/types';
import { MemoryStore } from './memory-store';
import { mutateComic, OpError } from './ops';
import { mergePanels } from './comic-ops';

async function seed(store: MemoryStore, comic = createComic('Seed')) {
	return store.create(comic.title, comic);
}

describe('mutateComic', () => {
	it('applies a change and saves with a new rev', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		const result = await mutateComic(store, rec.id, (comic) => {
			comic.title = 'Renamed';
			return 'renamed';
		});
		expect(result).toMatchObject({ rev: 2, summary: 'renamed' });
		const saved = await store.get(rec.id);
		expect(saved?.title).toBe('Renamed');
		expect((saved?.doc as Comic).title).toBe('Renamed');
	});

	it('rejects a change that breaks the grid invariant and saves nothing', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		await expect(
			mutateComic(store, rec.id, (comic) => {
				(comic.pages[0].panels[0] as GridPanel).cells.push(1); // cell 1 now claimed twice
				return 'broken';
			})
		).rejects.toThrow(/claimed by 2 panels/);
		expect((await store.get(rec.id))?.rev).toBe(1);
	});

	it('retries once on a conflicting write, then gives up with a conflict error', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		let calls = 0;
		// Another writer lands between our load and save, every time.
		store.beforeUpdate = async () => {
			const current = (await store.get(rec.id))!;
			await store.update(rec.id, current.doc as Comic, 'other', current.rev);
		};
		await expect(
			mutateComic(store, rec.id, (comic) => {
				calls++;
				comic.title = 'mine';
				return 'x';
			})
		).rejects.toMatchObject({ code: 'conflict' });
		expect(calls).toBe(2);
	});

	it('reports a missing comic as not-found', async () => {
		await expect(mutateComic(new MemoryStore(), 'nope', () => '')).rejects.toMatchObject({
			code: 'not-found'
		});
	});

	it('migrates stored documents before handing them to the change', async () => {
		const store = new MemoryStore();
		const rec = await seed(store);
		let seen: Comic | null = null;
		await mutateComic(store, rec.id, (comic) => {
			seen = comic;
			return '';
		});
		expect(JSON.parse(serialize(seen!)).docVersion).toBe(1);
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

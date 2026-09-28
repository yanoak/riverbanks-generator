// Opening and compacting a stored comic's Y.Doc, the same way in the browser and on the server.

import * as Y from 'yjs';
import { migrate } from '$lib/model/serialize';
import type { Comic } from '$lib/model/types';
import { comicToYDoc, LOAD, projectComic } from '$lib/model/ydoc';
import type { ComicStore, StoredState } from './store';

export interface OpenedDoc {
	doc: Y.Doc;
	/** The snapshot revision the doc was built on (compaction compares against it). */
	snapshotRev: number;
	/** The highest update id folded into that snapshot. */
	upto: number;
	/** Update rows applied to the doc; compaction may fold exactly these. */
	applied: Set<number>;
	updatedAt: string;
}

/** A new comic's snapshot. */
export const initialState = (comic: Comic): Uint8Array => Y.encodeStateAsUpdate(comicToYDoc(comic));

/** An encoded update that changes nothing is two zero bytes. */
export const isEmptyUpdate = (update: Uint8Array) => update.length <= 2;

function build(s: StoredState & { snapshot: Uint8Array }, doc = new Y.Doc()): OpenedDoc {
	Y.applyUpdate(doc, s.snapshot, LOAD);
	for (const u of s.updates) Y.applyUpdate(doc, u.update, LOAD);
	return {
		doc,
		snapshotRev: s.snapshotRev,
		upto: s.upto,
		applied: new Set(s.updates.map((u) => u.id)),
		updatedAt: s.updatedAt
	};
}

/** Load a comic's doc: snapshot plus every pending update. Converts a pre-Yjs comic once. */
export async function openDoc(store: ComicStore, id: string): Promise<OpenedDoc | null> {
	let s = await store.state(id);
	if (!s) return null;
	if (!s.snapshot) {
		const state = initialState(migrate(s.json));
		// Two first-openers race: one conversion wins and everyone uses it.
		if (!(await store.initSnapshot(id, state))) s = await store.state(id);
		else s = { ...s, snapshot: state, snapshotRev: 1, upto: 0 };
		if (!s?.snapshot) return null;
	}
	return build(s as StoredState & { snapshot: Uint8Array });
}

/**
 * Fold the applied updates into a new snapshot and refresh the JSON projection. If another
 * compaction won the race, merge its snapshot (and the rows still pending) and try once more.
 * Returns false only if that second attempt also lost, which is harmless: nothing is deleted.
 */
export async function compactDoc(store: ComicStore, id: string, opened: OpenedDoc) {
	for (let attempt = 0; attempt < 2; attempt++) {
		const projection = projectComic(opened.doc);
		const ok = await store.compact(id, {
			baseRev: opened.snapshotRev,
			state: Y.encodeStateAsUpdate(opened.doc),
			applied: [...opened.applied],
			title: projection.title,
			projection
		});
		if (ok) {
			opened.snapshotRev += 1;
			opened.upto = Math.max(opened.upto, ...opened.applied);
			opened.applied.clear();
			return true;
		}
		const s = await store.state(id);
		if (!s?.snapshot) return false;
		const merged = build(s as StoredState & { snapshot: Uint8Array }, opened.doc);
		opened.snapshotRev = merged.snapshotRev;
		opened.upto = merged.upto;
		opened.applied = merged.applied;
	}
	return false;
}

/** A monotonic revision: the highest update id in the doc, folded or pending. */
export const revisionOf = (opened: OpenedDoc) => Math.max(opened.upto, ...opened.applied);

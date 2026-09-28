// The headless edit loop shared by every MCP tool: open the comic's Y.Doc → change a draft →
// check → append the difference as one update. Concurrent writers (the open editor, another
// agent) merge instead of conflicting, so there is no retry loop.

import * as Y from 'yjs';
import { clone } from '$lib/model/clone';
import { checkPage } from '$lib/model/invariants';
import type { Comic } from '$lib/model/types';
import { applyComic, projectComic } from '$lib/model/ydoc';
import type { ComicStore } from './store';
import { compactDoc, isEmptyUpdate, openDoc, revisionOf } from './ydoc-store';

export type OpErrorCode = 'not-found' | 'conflict' | 'invalid';

export class OpError extends Error {
	constructor(
		readonly code: OpErrorCode,
		message: string
	) {
		super(message);
	}
}

export const invalid = (message: string) => new OpError('invalid', message);

/** Transaction origin for agent edits. */
export const MCP = 'mcp';

async function open(store: ComicStore, id: string) {
	const opened = await openDoc(store, id);
	if (!opened) throw new OpError('not-found', `No comic with id ${id}.`);
	return opened;
}

/** The comic's live state (not the stored projection, which may lag). */
export async function loadComic(store: ComicStore, id: string) {
	const opened = await open(store, id);
	const comic = projectComic(opened.doc);
	const rev = revisionOf(opened);
	return {
		record: { id, title: comic.title, rev, updatedAt: opened.updatedAt },
		comic
	};
}

/** Run `change` on a draft of the comic and store the difference; `change` returns a summary. */
export async function mutateComic(
	store: ComicStore,
	id: string,
	change: (comic: Comic) => string
): Promise<{ rev: number; summary: string; comic: Comic }> {
	const opened = await open(store, id);
	const before = projectComic(opened.doc);
	const after = clone(before);
	const summary = change(after);
	const problems = after.pages.flatMap((p, i) => checkPage(p).map((m) => `page ${i + 1}: ${m}`));
	if (problems.length) throw invalid(`That change would break the layout: ${problems.join('; ')}`);

	const base = Y.encodeStateVector(opened.doc);
	applyComic(opened.doc, before, after, MCP);
	const update = Y.encodeStateAsUpdate(opened.doc, base);
	let rev = revisionOf(opened);
	if (!isEmptyUpdate(update)) {
		opened.applied.add(await store.append(id, update));
		rev = revisionOf(opened);
		// Keeps the stored projection (comics list, search) current. Losing the race is fine.
		await compactDoc(store, id, opened);
	}
	return { rev, summary, comic: projectComic(opened.doc) };
}

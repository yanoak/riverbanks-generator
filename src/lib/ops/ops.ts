// The headless edit loop shared by every MCP tool: load → migrate → change → check → save with
// the rev guard. A conflicting writer (usually the open editor) gets one retry on fresh data.

import { checkPage } from '$lib/model/invariants';
import { migrate } from '$lib/model/serialize';
import type { Comic } from '$lib/model/types';
import type { ComicStore } from './store';

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

export async function loadComic(store: ComicStore, id: string) {
	const record = await store.get(id);
	if (!record) throw new OpError('not-found', `No comic with id ${id}.`);
	return { record, comic: migrate(record.doc) };
}

/** Run `change` on a fresh copy of the comic and save it; `change` returns a summary line. */
export async function mutateComic(
	store: ComicStore,
	id: string,
	change: (comic: Comic) => string
): Promise<{ rev: number; summary: string; comic: Comic }> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const { record, comic } = await loadComic(store, id);
		const summary = change(comic);
		const problems = comic.pages.flatMap((p, i) => checkPage(p).map((m) => `page ${i + 1}: ${m}`));
		if (problems.length)
			throw invalid(`That change would break the layout: ${problems.join('; ')}`);
		const result = await store.update(id, comic, comic.title, record.rev);
		if (result.ok) return { rev: result.rev, summary, comic };
		if (result.reason === 'not-found') throw new OpError('not-found', `No comic with id ${id}.`);
	}
	throw new OpError(
		'conflict',
		'The comic was changed by someone else twice while editing; try again.'
	);
}

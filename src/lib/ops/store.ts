import type { Comic } from '$lib/model/types';

export interface ComicSummary {
	id: string;
	title: string;
	rev: number;
	updatedAt: string;
	pages: number;
}

export interface ComicRecord {
	id: string;
	title: string;
	/** Raw stored document; run migrate() before use. */
	doc: unknown;
	rev: number;
	updatedAt: string;
}

export type UpdateResult =
	{ ok: true; rev: number } | { ok: false; reason: 'conflict' | 'not-found' };

/** Where comics live. Supabase in production (under the caller's RLS), memory in tests. */
export interface ComicStore {
	list(): Promise<ComicSummary[]>;
	get(id: string): Promise<ComicRecord | null>;
	/** Every comic the caller owns, with documents (for search). */
	records(): Promise<ComicRecord[]>;
	create(title: string, doc: Comic): Promise<ComicRecord>;
	/** Writes only if the stored rev still equals expectedRev. */
	update(id: string, doc: Comic, title: string, expectedRev: number): Promise<UpdateResult>;
	delete(id: string): Promise<boolean>;
}

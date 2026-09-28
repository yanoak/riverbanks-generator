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
	/** Stored JSON projection (run migrate() before use). Lags live edits until compaction. */
	doc: unknown;
	rev: number;
	updatedAt: string;
}

/** A comic's Y.Doc as stored: the snapshot and every update not yet folded into it. */
export interface StoredState {
	/** Null for a comic saved before Yjs; openDoc converts it from `json`. */
	snapshot: Uint8Array | null;
	/** Compare-and-set counter for snapshot writes. */
	snapshotRev: number;
	/** How many updates the snapshot has folded in (continues the pre-Yjs revision). */
	upto: number;
	updates: { id: number; update: Uint8Array }[];
	json: unknown;
	updatedAt: string;
}

export interface Compaction {
	baseRev: number;
	state: Uint8Array;
	/** The update rows folded into `state`; exactly these are deleted. */
	applied: number[];
	title: string;
	projection: Comic;
}

/** Where comics live. Supabase in production (under the caller's RLS), memory in tests. */
export interface ComicStore {
	list(): Promise<ComicSummary[]>;
	/** The row with its JSON projection (for listing and search, not for editing). */
	get(id: string): Promise<ComicRecord | null>;
	/** Every comic the caller can open, with projections (for search). */
	records(): Promise<ComicRecord[]>;
	/** A new comic; `state` is its Y.Doc snapshot. */
	create(title: string, comic: Comic, state: Uint8Array): Promise<ComicRecord>;
	delete(id: string): Promise<boolean>;

	state(id: string): Promise<StoredState | null>;
	/** Store the converted snapshot of a pre-Yjs comic; false if one exists already. */
	initSnapshot(id: string, state: Uint8Array): Promise<boolean>;
	/** Append a Yjs update; returns its row id. */
	append(id: string, update: Uint8Array): Promise<number>;
	/** Replace the snapshot if it is still at `baseRev`; false if someone compacted first. */
	compact(id: string, c: Compaction): Promise<boolean>;
}

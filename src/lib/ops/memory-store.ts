import { clone } from '$lib/model/clone';
import { newId } from '$lib/model/factory';
import type { Comic } from '$lib/model/types';
import type { ComicRecord, ComicStore, ComicSummary, Compaction, StoredState } from './store';

interface Row extends ComicRecord {
	snapshot: Uint8Array | null;
	snapshotRev: number;
	upto: number;
}

/** In-memory ComicStore with the database's semantics (see the comic_ydoc_log migration). */
export class MemoryStore implements ComicStore {
	private rows = new Map<string, Row>();
	private updates: { id: number; comicId: string; update: Uint8Array }[] = [];
	private nextUpdateId = 1;

	private record(r: Row): ComicRecord {
		return clone({ id: r.id, title: r.title, doc: r.doc, rev: r.rev, updatedAt: r.updatedAt });
	}

	async list(): Promise<ComicSummary[]> {
		return [...this.rows.values()].map((r) => ({
			id: r.id,
			title: r.title,
			rev: r.rev,
			updatedAt: r.updatedAt,
			pages: (r.doc as Comic).pages.length
		}));
	}

	async get(id: string): Promise<ComicRecord | null> {
		const row = this.rows.get(id);
		return row ? this.record(row) : null;
	}

	async records(): Promise<ComicRecord[]> {
		return [...this.rows.values()].map((r) => this.record(r));
	}

	async create(title: string, comic: Comic, state: Uint8Array): Promise<ComicRecord> {
		const row: Row = {
			id: newId(),
			title,
			doc: clone(comic),
			rev: 1,
			updatedAt: new Date().toISOString(),
			snapshot: state,
			snapshotRev: 1,
			upto: 0
		};
		this.rows.set(row.id, row);
		return this.record(row);
	}

	/** Test hook: a comic saved before Yjs (JSON only). */
	createLegacy(comic: Comic): string {
		const row: Row = {
			id: newId(),
			title: comic.title,
			doc: clone(comic),
			rev: 1,
			updatedAt: new Date().toISOString(),
			snapshot: null,
			snapshotRev: 0,
			upto: 0
		};
		this.rows.set(row.id, row);
		return row.id;
	}

	async delete(id: string): Promise<boolean> {
		this.updates = this.updates.filter((u) => u.comicId !== id);
		return this.rows.delete(id);
	}

	async state(id: string): Promise<StoredState | null> {
		const row = this.rows.get(id);
		if (!row) return null;
		return {
			snapshot: row.snapshot,
			snapshotRev: row.snapshotRev,
			upto: row.upto,
			updates: this.updates
				.filter((u) => u.comicId === id)
				.map((u) => ({ id: u.id, update: u.update })),
			json: clone(row.doc),
			updatedAt: row.updatedAt
		};
	}

	async initSnapshot(id: string, state: Uint8Array): Promise<boolean> {
		const row = this.rows.get(id);
		if (!row || row.snapshot) return false;
		Object.assign(row, { snapshot: state, snapshotRev: 1 });
		return true;
	}

	async append(id: string, update: Uint8Array): Promise<number> {
		if (!this.rows.has(id)) throw new Error(`No comic ${id}`);
		const row = { id: this.nextUpdateId++, comicId: id, update };
		this.updates.push(row);
		return row.id;
	}

	/** Test hook: an update whose id was allocated now but that becomes visible later. */
	reserveUpdateId(): number {
		return this.nextUpdateId++;
	}

	/** Test hook: make a reserved update visible. */
	commitReserved(id: number, comicId: string, update: Uint8Array): void {
		this.updates.push({ id, comicId, update });
		this.updates.sort((a, b) => a.id - b.id);
	}

	async compact(id: string, c: Compaction): Promise<boolean> {
		const row = this.rows.get(id);
		if (!row || row.snapshotRev !== c.baseRev) return false;
		Object.assign(row, {
			snapshot: c.state,
			snapshotRev: c.baseRev + 1,
			upto: Math.max(row.upto, ...c.applied),
			title: c.title,
			doc: clone(c.projection),
			rev: row.rev + 1,
			updatedAt: new Date().toISOString()
		});
		const folded = new Set(c.applied);
		this.updates = this.updates.filter((u) => u.comicId !== id || !folded.has(u.id));
		return true;
	}
}

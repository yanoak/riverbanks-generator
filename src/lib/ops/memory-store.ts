import { clone } from '$lib/model/clone';
import { newId } from '$lib/model/factory';
import type { Comic } from '$lib/model/types';
import type { ComicRecord, ComicStore, ComicSummary, UpdateResult } from './store';

/** In-memory ComicStore with the same rev semantics as the database trigger. For tests. */
export class MemoryStore implements ComicStore {
	private rows = new Map<string, ComicRecord>();
	/** Test hook: runs inside update() before the rev check, to simulate a racing writer. */
	beforeUpdate: (() => Promise<void>) | null = null;

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
		return row ? clone(row) : null;
	}

	async create(title: string, doc: Comic): Promise<ComicRecord> {
		const row = {
			id: newId(),
			title,
			doc: clone(doc),
			rev: 1,
			updatedAt: new Date().toISOString()
		};
		this.rows.set(row.id, row);
		return clone(row);
	}

	async update(id: string, doc: Comic, title: string, expectedRev: number): Promise<UpdateResult> {
		const hook = this.beforeUpdate;
		this.beforeUpdate = null; // one racing write per call; restored after
		if (hook) await hook();
		this.beforeUpdate = hook;
		const row = this.rows.get(id);
		if (!row) return { ok: false, reason: 'not-found' };
		if (row.rev !== expectedRev) return { ok: false, reason: 'conflict' };
		Object.assign(row, {
			doc: clone(doc),
			title,
			rev: row.rev + 1,
			updatedAt: new Date().toISOString()
		});
		return { ok: true, rev: row.rev };
	}

	async delete(id: string): Promise<boolean> {
		return this.rows.delete(id);
	}
}

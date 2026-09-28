// ComicStore over the comics table and its update log. Runs as whoever the client is
// authenticated as, so RLS scopes every query to comics that user can open. Works in the
// browser and on the server alike.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Comic } from '$lib/model/types';
import type {
	ComicRecord,
	ComicStore,
	ComicSummary,
	Compaction,
	StoredState
} from '$lib/ops/store';

/** bytea travels through PostgREST as a hex string. */
export const toBytea = (bytes: Uint8Array) =>
	'\\x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function fromBytea(value: string): Uint8Array {
	const hex = value.startsWith('\\x') ? value.slice(2) : value;
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

type Row = { id: string; title: string; doc: unknown; rev: number; updated_at: string };

const toRecord = (r: Row): ComicRecord => ({
	id: r.id,
	title: r.title,
	doc: r.doc,
	rev: r.rev,
	updatedAt: r.updated_at
});

const fail = (what: string, error: { message: string }) =>
	new Error(`Could not ${what}: ${error.message}`);

export class SupabaseComicStore implements ComicStore {
	constructor(private supabase: SupabaseClient) {}

	async list(): Promise<ComicSummary[]> {
		const { data, error } = await this.supabase
			.from('comics')
			.select('id, title, rev, updated_at, pages:doc->pages')
			.order('updated_at', { ascending: false });
		if (error) throw fail('list comics', error);
		return (data as (Omit<Row, 'doc'> & { pages: unknown[] })[]).map((r) => ({
			id: r.id,
			title: r.title,
			rev: r.rev,
			updatedAt: r.updated_at,
			pages: Array.isArray(r.pages) ? r.pages.length : 0
		}));
	}

	async get(id: string): Promise<ComicRecord | null> {
		if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
		const { data, error } = await this.supabase
			.from('comics')
			.select('id, title, doc, rev, updated_at')
			.eq('id', id)
			.maybeSingle();
		if (error) throw fail('load the comic', error);
		return data ? toRecord(data as Row) : null;
	}

	async records(): Promise<ComicRecord[]> {
		const { data, error } = await this.supabase
			.from('comics')
			.select('id, title, doc, rev, updated_at')
			.order('updated_at', { ascending: false });
		if (error) throw fail('search comics', error);
		return (data as Row[]).map(toRecord);
	}

	async create(title: string, comic: Comic, state: Uint8Array): Promise<ComicRecord> {
		const { data, error } = await this.supabase
			.from('comics')
			.insert({ title, doc: comic, ydoc: toBytea(state), ydoc_rev: 1 })
			.select('id, title, doc, rev, updated_at')
			.single();
		if (error) throw fail('create the comic', error);
		return toRecord(data as Row);
	}

	async state(id: string): Promise<StoredState | null> {
		if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
		const [row, log] = await Promise.all([
			this.supabase
				.from('comics')
				.select('doc, ydoc, ydoc_rev, ydoc_upto, updated_at')
				.eq('id', id)
				.maybeSingle(),
			this.supabase.from('comic_updates').select('id, update').eq('comic_id', id).order('id')
		]);
		if (row.error) throw fail('load the comic', row.error);
		if (log.error) throw fail('load the comic', log.error);
		if (!row.data) return null;
		const r = row.data as {
			doc: unknown;
			ydoc: string | null;
			ydoc_rev: number;
			ydoc_upto: number;
			updated_at: string;
		};
		return {
			snapshot: r.ydoc ? fromBytea(r.ydoc) : null,
			snapshotRev: r.ydoc_rev,
			upto: Number(r.ydoc_upto),
			updates: (log.data as { id: number; update: string }[]).map((u) => ({
				id: Number(u.id),
				update: fromBytea(u.update)
			})),
			json: r.doc,
			updatedAt: r.updated_at
		};
	}

	async initSnapshot(id: string, state: Uint8Array): Promise<boolean> {
		const { data, error } = await this.supabase.rpc('init_comic_ydoc', {
			comic: id,
			state: toBytea(state)
		});
		if (error) throw fail('convert the comic', error);
		return data === true;
	}

	async append(id: string, update: Uint8Array): Promise<number> {
		const { data, error } = await this.supabase
			.from('comic_updates')
			.insert({ comic_id: id, update: toBytea(update) })
			.select('id')
			.single();
		if (error) throw fail('save the change', error);
		return Number((data as { id: number }).id);
	}

	async compact(id: string, c: Compaction): Promise<boolean> {
		const { data, error } = await this.supabase.rpc('compact_comic', {
			comic: id,
			base_rev: c.baseRev,
			state: toBytea(c.state),
			applied: c.applied,
			new_title: c.title,
			projection: c.projection
		});
		if (error) throw fail('compact the comic', error);
		return data === true;
	}

	async delete(id: string): Promise<boolean> {
		if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
		const { data, error } = await this.supabase.from('comics').delete().eq('id', id).select('id');
		if (error) throw fail('delete the comic', error);
		return (data ?? []).length > 0;
	}
}

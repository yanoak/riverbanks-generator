// ComicStore over the comics table. Runs as whoever the client is authenticated as, so RLS
// scopes every query to that user; the rev guard makes stale writes match zero rows.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Comic } from '$lib/model/types';
import type { ComicRecord, ComicStore, ComicSummary, UpdateResult } from '$lib/ops/store';

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

	async create(title: string, doc: Comic): Promise<ComicRecord> {
		const { data, error } = await this.supabase
			.from('comics')
			.insert({ title, doc })
			.select('id, title, doc, rev, updated_at')
			.single();
		if (error) throw fail('create the comic', error);
		return toRecord(data as Row);
	}

	async update(id: string, doc: Comic, title: string, expectedRev: number): Promise<UpdateResult> {
		const { data, error } = await this.supabase
			.from('comics')
			.update({ doc, title })
			.eq('id', id)
			.eq('rev', expectedRev)
			.select('rev')
			.maybeSingle();
		if (error) throw fail('save the comic', error);
		if (data) return { ok: true, rev: (data as { rev: number }).rev };
		return { ok: false, reason: (await this.get(id)) ? 'conflict' : 'not-found' };
	}

	async delete(id: string): Promise<boolean> {
		if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
		const { data, error } = await this.supabase.from('comics').delete().eq('id', id).select('id');
		if (error) throw fail('delete the comic', error);
		return (data ?? []).length > 0;
	}
}

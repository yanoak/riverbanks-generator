// A comic row in Supabase. Tracks the row's rev: saves send it (the rev guard turns a stale
// save into ConflictError), and realtime updates with a newer rev are reported via watch().

import type { SupabaseClient } from '@supabase/supabase-js';
import { clone } from '$lib/model/clone';
import { migrate } from '$lib/model/serialize';
import type { Comic } from '$lib/model/types';
import { ConflictError } from './autosave';
import type { DocumentSource } from './source';
import { SupabaseComicStore } from './supabase-store';

export class CloudSource implements DocumentSource {
	private store: SupabaseComicStore;
	private saving: Promise<void> | null = null;

	constructor(
		private supabase: SupabaseClient,
		private id: string,
		private initial: { doc: unknown; rev: number }
	) {
		this.store = new SupabaseComicStore(supabase);
		this.rev = initial.rev;
	}

	rev: number;

	async load(): Promise<Comic> {
		return migrate(this.initial.doc);
	}

	async save(comic: Comic): Promise<void> {
		const run = async () => {
			const result = await this.store.update(this.id, clone(comic), comic.title, this.rev);
			if (result.ok) this.rev = result.rev;
			else if (result.reason === 'conflict') throw new ConflictError();
			else throw new Error('This comic no longer exists.');
		};
		this.saving = run();
		try {
			await this.saving;
		} finally {
			this.saving = null;
		}
	}

	async reload(): Promise<Comic> {
		const record = await this.store.get(this.id);
		if (!record) throw new Error('This comic no longer exists.');
		this.rev = record.rev;
		return migrate(record.doc);
	}

	async overwrite(comic: Comic): Promise<void> {
		const record = await this.store.get(this.id);
		if (!record) throw new Error('This comic no longer exists.');
		this.rev = record.rev;
		await this.save(comic);
	}

	watch(onRemote: (comic: Comic) => void, onLive?: () => void): () => void {
		let stopped = false;
		let channel: ReturnType<SupabaseClient['channel']> | null = null;
		// The browser client restores its session from cookies asynchronously; subscribing before
		// that joins as anon, and RLS then filters out every change. Hand Realtime the token first.
		this.supabase.auth.getSession().then(async ({ data }) => {
			if (stopped) return;
			if (data.session) await this.supabase.realtime.setAuth(data.session.access_token);
			channel = this.subscribe(onRemote, async () => {
				// Anything written between page load and joining the channel was missed: catch up once.
				const record = await this.store.get(this.id).catch(() => null);
				if (!stopped && record) this.apply(record.rev, record.doc, onRemote);
				if (!stopped) onLive?.();
			});
		});
		return () => {
			stopped = true;
			if (channel) this.supabase.removeChannel(channel);
		};
	}

	/** Report a newer copy (unless our own save is still settling to that rev). */
	private async apply(rev: number, doc: unknown, onRemote: (comic: Comic) => void) {
		// Our own save's echo can arrive before its response; settle that first.
		if (this.saving) await this.saving.catch(() => {});
		if (rev <= this.rev) return;
		this.rev = rev;
		onRemote(migrate(doc));
	}

	private subscribe(onRemote: (comic: Comic) => void, onSubscribed: () => void) {
		return this.supabase
			.channel(`comic:${this.id}`)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'comics', filter: `id=eq.${this.id}` },
				(payload) => {
					const row = payload.new as { rev: number; doc: unknown };
					this.apply(row.rev, row.doc, onRemote);
				}
			)
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') onSubscribed();
			});
	}
}

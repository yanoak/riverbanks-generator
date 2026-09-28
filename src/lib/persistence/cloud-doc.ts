// A cloud comic's Y.Doc, kept in sync with Supabase. Local edits are batched into rows of the
// insert-only update log; every row (ours included) comes back over the comic's private
// Realtime channel, and joining or rejoining the channel catches up on anything missed. Rows
// are never overwritten, so nothing one person does can erase another's work.

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import { LOAD } from '$lib/model/ydoc';
import { compactDoc, isEmptyUpdate, openDoc, type OpenedDoc } from '$lib/ops/ydoc-store';
import { fromBytea, SupabaseComicStore } from './supabase-store';

/** Row-level security refused the write: this user may no longer edit the comic. */
const isRefused = (e: unknown) => (e as { code?: string }).code === '42501';

/** Origin of updates that arrived from the server (never sent back). */
export const REMOTE = 'remote';

export type SyncStatus = 'saved' | 'saving' | 'offline';

const BATCH_MS = 150;
const RETRY_MS = [1000, 2000, 5000, 10000, 30000];
/** Compact on open once this many updates are waiting in the log. */
const COMPACT_AFTER = 100;

export class CloudDoc {
	private store: SupabaseComicStore;
	private opened: OpenedDoc | null = null;
	private pending: Uint8Array[] = [];
	private inflight: Promise<void> | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private failures = 0;
	private channel: ReturnType<SupabaseClient['channel']> | null = null;
	private stopped = false;
	private offUpdate: (() => void) | null = null;

	status: SyncStatus = 'saved';
	onstatus: ((s: SyncStatus) => void) | null = null;
	/** Fires each time the live channel is (re)joined and caught up. */
	onlive: ((live: boolean) => void) | null = null;
	/** Access was withdrawn (removed from the comic): writes and the channel are refused. */
	onrevoked: (() => void) | null = null;

	constructor(
		private supabase: SupabaseClient,
		readonly id: string
	) {
		this.store = new SupabaseComicStore(supabase);
	}

	/** Load the doc (snapshot + pending updates); throws if the comic is gone. */
	async open(): Promise<Y.Doc> {
		const opened = await openDoc(this.store, this.id);
		if (!opened) throw new Error('This comic no longer exists.');
		this.opened = opened;
		const onUpdate = (update: Uint8Array, origin: unknown) => {
			if (origin === REMOTE || origin === LOAD) return;
			this.pending.push(update);
			this.setStatus('saving');
			this.schedule(BATCH_MS);
		};
		opened.doc.on('update', onUpdate);
		this.offUpdate = () => opened.doc.off('update', onUpdate);
		if (opened.applied.size >= COMPACT_AFTER) void this.compact();
		return opened.doc;
	}

	/** Join the comic's channel and keep receiving everyone's updates. */
	async connect(): Promise<void> {
		// The browser client restores its session asynchronously; joining before that would join
		// as anon and be refused by the channel's RLS.
		const { data } = await this.supabase.auth.getSession();
		if (this.stopped) return;
		if (data.session) await this.supabase.realtime.setAuth(data.session.access_token);
		this.channel = this.supabase
			.channel(`comic:${this.id}`, { config: { private: true } })
			.on('broadcast', { event: 'update' }, ({ payload }) => void this.receive(payload))
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					void this.catchUp().then(() => this.onlive?.(true));
					void this.flush(); // anything that failed while we were offline
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
					this.onlive?.(false);
					// A refused (re)join means access was withdrawn; confirm with a read.
					if (status === 'CHANNEL_ERROR') void this.checkAccess();
				}
			});
		window.addEventListener('online', this.retryNow);
	}

	private async checkAccess() {
		const { data, error } = await this.supabase
			.from('comics')
			.select('id')
			.eq('id', this.id)
			.maybeSingle();
		if (!error && !data && !this.stopped) {
			this.stopped = true;
			this.onrevoked?.();
		}
	}

	private retryNow = () => {
		this.failures = 0;
		void this.flush();
	};

	private apply(id: number, update: Uint8Array) {
		const opened = this.opened;
		if (!opened || opened.applied.has(id)) return;
		Y.applyUpdate(opened.doc, update, REMOTE);
		opened.applied.add(id);
	}

	private async receive(payload: { id: number; update?: string; fetch?: boolean }) {
		if (payload.update !== undefined) {
			const bytes = Uint8Array.from(atob(payload.update), (c) => c.charCodeAt(0));
			return this.apply(Number(payload.id), bytes);
		}
		// Too big to broadcast: read the row.
		const { data } = await this.supabase
			.from('comic_updates')
			.select('update')
			.eq('id', payload.id)
			.maybeSingle();
		if (data) this.apply(Number(payload.id), fromBytea((data as { update: string }).update));
	}

	/** Apply every stored update we haven't seen (after joining, or a dropped connection). */
	private async catchUp() {
		const opened = this.opened;
		if (!opened) return;
		const s = await this.store.state(this.id).catch(() => null);
		if (!s || this.stopped) return;
		if (s.snapshotRev !== opened.snapshotRev && s.snapshot) {
			// Someone compacted while we were away: their snapshot may hold updates whose rows are
			// gone. Merging it is idempotent.
			Y.applyUpdate(opened.doc, s.snapshot, REMOTE);
			opened.snapshotRev = s.snapshotRev;
			opened.upto = s.upto;
			opened.applied.clear();
		}
		for (const u of s.updates) this.apply(u.id, u.update);
	}

	private schedule(ms: number) {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.flush(), ms);
	}

	/** Send what's pending as one row; waits for a send already in flight. */
	async flush(): Promise<void> {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (this.inflight) {
			await this.inflight;
			if (this.pending.length) return this.flush();
			return;
		}
		if (!this.pending.length) return;
		const batch = this.pending.splice(0);
		const update = Y.mergeUpdates(batch);
		this.inflight = (async () => {
			try {
				if (!isEmptyUpdate(update)) {
					const id = await this.store.append(this.id, update);
					this.opened?.applied.add(id);
				}
				this.failures = 0;
				this.setStatus(this.pending.length ? 'saving' : 'saved');
			} catch (e) {
				if (isRefused(e)) {
					this.stopped = true;
					this.onrevoked?.();
					return;
				}
				console.warn('Saving the change failed; will retry', e);
				this.pending.unshift(update);
				this.setStatus('offline');
				const wait = RETRY_MS[Math.min(this.failures++, RETRY_MS.length - 1)];
				if (!this.stopped) this.schedule(wait);
			}
		})();
		try {
			await this.inflight;
		} finally {
			this.inflight = null;
		}
		if (this.pending.length && this.status !== 'offline') this.schedule(BATCH_MS);
	}

	/**
	 * Fold the log into the snapshot and refresh the stored projection (the comics list reads
	 * it). Best effort: run when the tab is hidden.
	 */
	async compact(): Promise<void> {
		const opened = this.opened;
		if (!opened) return;
		await this.flush();
		if (this.pending.length || !opened.applied.size) return;
		await compactDoc(this.store, this.id, opened).catch((e) =>
			console.warn('Compacting the comic failed', e)
		);
	}

	private setStatus(s: SyncStatus) {
		if (s === this.status) return;
		this.status = s;
		this.onstatus?.(s);
	}

	destroy(): void {
		this.stopped = true;
		void this.flush();
		this.offUpdate?.();
		if (this.timer) clearTimeout(this.timer);
		if (this.channel) void this.supabase.removeChannel(this.channel);
		window.removeEventListener('online', this.retryNow);
	}
}

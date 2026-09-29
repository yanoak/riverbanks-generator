// Who else is on this comic, and what they are doing: a Yjs awareness instance whose updates
// travel over the comic's Realtime channel (see CloudDoc). Never stored. Carries each person's
// page, selection, move claims (the soft hold) and, via the text editor, their caret.

import type * as Y from 'yjs';
import {
	applyAwarenessUpdate,
	Awareness,
	encodeAwarenessUpdate,
	removeAwarenessStates
} from 'y-protocols/awareness';
import type { Rect } from '$lib/model/types';
import { holderOf, STALE_MS, type MoveClaim, type PeerState, type PeerUser } from './hold';

export interface Peer {
	clientId: number;
	user: PeerUser;
	page?: string;
	selection: string[];
	moving: MoveClaim | null;
}

/** At most one send per this many ms (the free tier allows 100 messages/s project-wide). */
const SEND_MS = 100;
const HEARTBEAT_MS = 2000;
const SWEEP_MS = 1000;
const REMOTE = 'remote';

export class Presence {
	readonly awareness: Awareness;
	/** Everyone else, fresh states only. */
	peers = $state<Peer[]>([]);
	/** Send an encoded awareness update to the others. */
	onsend: ((update: Uint8Array) => void) | null = null;

	// Bookkeeping for staleness; `peers` is what renders.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private lastSeen = new Map<number, number>();
	private sendTimer: ReturnType<typeof setTimeout> | null = null;
	private sendPending = false;
	private intervals: ReturnType<typeof setInterval>[] = [];

	constructor(
		doc: Y.Doc,
		readonly user: PeerUser,
		private now: () => number = Date.now,
		opts: { timers?: boolean } = {}
	) {
		this.awareness = new Awareness(doc);
		this.awareness.setLocalState({ user } satisfies PeerState);
		this.awareness.on(
			'update',
			(
				{ added, updated, removed }: Record<'added' | 'updated' | 'removed', number[]>,
				origin: unknown
			) => {
				if (origin === REMOTE) {
					for (const id of [...added, ...updated]) this.lastSeen.set(id, this.now());
					for (const id of removed) this.lastSeen.delete(id);
					this.refresh();
				} else this.scheduleSend(); // our own state isn't in `peers`
			}
		);
		if (opts.timers !== false) {
			this.intervals.push(
				setInterval(() => this.heartbeat(), HEARTBEAT_MS),
				setInterval(() => this.sweep(), SWEEP_MS)
			);
		}
		this.refresh();
	}

	get self(): number {
		return this.awareness.clientID;
	}

	private get local(): PeerState {
		return this.awareness.getLocalState() as PeerState;
	}

	/** Merge fields into what this client publishes. */
	set(fields: Partial<PeerState>): void {
		const state = this.local;
		if (!state) return;
		this.awareness.setLocalState({ ...state, ...fields });
	}

	/** Apply an update another client sent. */
	receive(update: Uint8Array): void {
		applyAwarenessUpdate(this.awareness, update, REMOTE);
	}

	/** This client's whole state, for someone who just joined. */
	encodeLocal(): Uint8Array {
		return encodeAwarenessUpdate(this.awareness, [this.self]);
	}

	// --- the soft hold ------------------------------------------------------------------------

	private holder(id: string) {
		const states = this.awareness.getStates() as Map<number, PeerState>;
		return holderOf(id, states, this.lastSeen, this.now(), this.self);
	}

	/** Another person moving `id` right now, if any. */
	heldBy(id: string): Peer | null {
		const h = this.holder(id);
		return h && h.clientId !== this.self
			? (this.peers.find((p) => p.clientId === h.clientId) ?? null)
			: null;
	}

	/** Claim `id` for a drag; false if someone else already holds it. */
	claim(id: string, rect: Rect): boolean {
		if (this.heldBy(id)) return false;
		this.set({ moving: { id, since: this.now(), rect: { ...rect } } });
		return true;
	}

	/** Our claim on `id` still wins (it can lose a simultaneous-grab tie). */
	holds(id: string): boolean {
		return this.holder(id)?.clientId === this.self;
	}

	moveTo(rect: Rect): void {
		const claim = this.local?.moving;
		if (claim) this.set({ moving: { ...claim, rect: { ...rect } } });
	}

	release(): void {
		if (this.local?.moving) this.set({ moving: null });
	}

	// --- upkeep -----------------------------------------------------------------------------

	private scheduleSend(): void {
		if (this.sendTimer) {
			this.sendPending = true;
			return;
		}
		this.onsend?.(this.encodeLocal());
		this.sendTimer = setTimeout(() => {
			this.sendTimer = null;
			if (this.sendPending) {
				this.sendPending = false;
				this.scheduleSend();
			}
		}, SEND_MS);
	}

	/** Re-publish so others know we're still here. */
	heartbeat(): void {
		const state = this.local;
		if (state) this.awareness.setLocalState({ ...state });
	}

	/** Forget anyone not heard from in STALE_MS (their tab closed, or their network dropped). */
	sweep(): void {
		const cutoff = this.now() - STALE_MS;
		const stale = [...this.lastSeen].filter(([, t]) => t < cutoff).map(([id]) => id);
		if (stale.length) removeAwarenessStates(this.awareness, stale, 'timeout');
		this.refresh();
	}

	private refresh(): void {
		const cutoff = this.now() - STALE_MS;
		const peers: Peer[] = [];
		for (const [clientId, raw] of this.awareness.getStates()) {
			const state = raw as PeerState;
			if (clientId === this.self || !state?.user) continue;
			if ((this.lastSeen.get(clientId) ?? 0) < cutoff) continue;
			peers.push({
				clientId,
				user: state.user,
				page: state.page,
				selection: state.selection ?? [],
				moving: state.moving ?? null
			});
		}
		// Only replace when something changed: heartbeats arrive every 2 s per person, and each
		// new array would re-render everything that reads `peers`.
		if (JSON.stringify(peers) !== JSON.stringify(this.peers)) this.peers = peers;
	}

	private destroyed = false;

	/** Leave (idempotent: runs on pagehide and again when the editor unmounts). */
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		for (const i of this.intervals) clearInterval(i);
		if (this.sendTimer) clearTimeout(this.sendTimer);
		// Tell the others we left, straight away rather than after the timeout.
		this.awareness.setLocalState(null);
		this.onsend?.(encodeAwarenessUpdate(this.awareness, [this.self]));
		this.awareness.destroy();
	}
}

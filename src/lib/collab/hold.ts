// "Someone is moving this": while a person drags, resizes or pans something, their presence
// state claims it, and everyone else's editor refuses to move it until they let go. A claim is
// advisory (the document doesn't enforce it); see the plan's "soft hold".

import type { Rect } from '$lib/model/types';

/** A presence state with no update for this long is gone (closed tab, lost network). */
export const STALE_MS = 5000;

export interface PeerUser {
	id: string;
	name: string;
	color: string;
}

export interface MoveClaim {
	/** The balloon or panel being moved. */
	id: string;
	/** When the drag started (ms since epoch): the earlier claim wins a tie. */
	since: number;
	/** Where it is now, so others can show it following the pointer. */
	rect: Rect;
}

/** What each client publishes about itself (Yjs awareness state). */
export interface PeerState {
	user: PeerUser;
	/** The page they are looking at, by id. */
	page?: string;
	/** Selected panel or balloon ids on that page. */
	selection?: string[];
	moving?: MoveClaim | null;
}

/**
 * Who holds `id`: among fresh states claiming it, the earliest claim, ties to the lower client
 * id. `lastSeen` gives when each remote state last updated; `self` (the local client) is never
 * stale.
 */
export function holderOf(
	id: string,
	states: Map<number, PeerState>,
	lastSeen: Map<number, number>,
	now: number,
	self?: number
): { clientId: number; state: PeerState } | null {
	let best: { clientId: number; state: PeerState } | null = null;
	for (const [clientId, state] of states) {
		const claim = state?.moving;
		if (!claim || claim.id !== id) continue;
		if (clientId !== self && now - (lastSeen.get(clientId) ?? 0) > STALE_MS) continue;
		const b = best?.state.moving;
		if (!best || claim.since < b!.since || (claim.since === b!.since && clientId < best.clientId)) {
			best = { clientId, state };
		}
	}
	return best;
}

/** A stable colour per person. */
const PALETTE = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#c026d3'];
export function colorFor(userId: string): string {
	let h = 0;
	for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return PALETTE[h % PALETTE.length];
}

/** "ak@thibi.co" → "ak"; the part people recognise. */
export const displayName = (email: string) => email.split('@')[0];

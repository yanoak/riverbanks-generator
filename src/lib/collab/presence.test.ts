import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Presence } from './presence.svelte';

const rect = { x: 0, y: 0, w: 10, h: 10 };

/** Two presences wired together like the channel would, with a controllable clock. */
function pair() {
	let t = 1_000_000;
	const clock = () => t;
	const a = new Presence(new Y.Doc(), { id: 'a', name: 'ann', color: '#f00' }, clock, {
		timers: false
	});
	const b = new Presence(new Y.Doc(), { id: 'b', name: 'bo', color: '#00f' }, clock, {
		timers: false
	});
	a.onsend = (u) => b.receive(u);
	b.onsend = (u) => a.receive(u);
	a.receive(b.encodeLocal());
	b.receive(a.encodeLocal());
	return { a, b, tick: (ms: number) => (t += ms) };
}

afterEach(() => vi.useRealTimers());

describe('Presence', () => {
	it('each sees the other, with page and selection', () => {
		const { a, b } = pair();
		a.set({ page: 'p1', selection: ['x'] });
		expect(b.peers).toEqual([
			expect.objectContaining({ user: expect.objectContaining({ name: 'ann' }), page: 'p1' })
		]);
		expect(b.peers[0].selection).toEqual(['x']);
		expect(a.peers.map((p) => p.user.name)).toEqual(['bo']);
	});

	it('a claim blocks the other side until released', () => {
		vi.useFakeTimers();
		const { a, b } = pair();
		expect(a.claim('b1', rect)).toBe(true);
		expect(b.heldBy('b1')?.user.name).toBe('ann');
		expect(b.claim('b1', rect)).toBe(false);
		a.moveTo({ ...rect, x: 50 }); // throttled: goes out within 100 ms
		vi.advanceTimersByTime(100);
		expect(b.heldBy('b1')?.moving?.rect.x).toBe(50);
		a.release();
		vi.advanceTimersByTime(100);
		expect(b.heldBy('b1')).toBeNull();
		expect(b.claim('b1', rect)).toBe(true);
	});

	it('a simultaneous grab: the later claim loses once both are seen', () => {
		const { a, b, tick } = pair();
		// Neither has seen the other's claim yet.
		const sendB = b.onsend;
		b.onsend = null;
		a.claim('b1', rect);
		tick(5);
		b.claim('b1', rect); // later
		b.onsend = sendB;
		b.heartbeat();
		expect(a.holds('b1')).toBe(true);
		expect(b.holds('b1')).toBe(false);
		expect(b.heldBy('b1')?.user.name).toBe('ann');
	});

	it('forgets someone not heard from in over 5 s, which frees their claim', () => {
		const { a, b, tick } = pair();
		a.claim('b1', rect);
		a.onsend = null; // A's tab goes quiet
		tick(4000);
		b.sweep();
		expect(b.peers).toHaveLength(1);
		tick(1500);
		b.sweep();
		expect(b.peers).toHaveLength(0);
		expect(b.heldBy('b1')).toBeNull();
	});

	it('leaving tells the others at once', () => {
		const { a, b } = pair();
		a.destroy();
		expect(b.peers).toHaveLength(0);
	});

	it('sends at most one update per 100 ms, and the last change always goes out', () => {
		vi.useFakeTimers();
		const p = new Presence(new Y.Doc(), { id: 'c', name: 'c', color: '#000' }, Date.now, {
			timers: false
		});
		const sent: Uint8Array[] = [];
		p.onsend = (u) => sent.push(u);
		for (let i = 0; i < 20; i++) p.set({ selection: [String(i)] });
		expect(sent).toHaveLength(1);
		vi.advanceTimersByTime(100);
		expect(sent).toHaveLength(2);
		const other = new Presence(new Y.Doc(), { id: 'd', name: 'd', color: '#000' }, Date.now, {
			timers: false
		});
		for (const u of sent) other.receive(u);
		expect(other.peers[0].selection).toEqual(['19']);
	});
});

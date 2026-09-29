import { describe, expect, it } from 'vitest';
import { holderOf, STALE_MS, type PeerState } from './hold';

const user = (name: string) => ({ id: name, name, color: '#000' });
const rect = { x: 0, y: 0, w: 10, h: 10 };
const moving = (id: string, since: number) => ({ id, since, rect });

describe('holderOf', () => {
	const now = 100_000;
	const fresh = (states: Map<number, PeerState>) =>
		new Map([...states.keys()].map((c) => [c, now - 1000]));

	it('nobody moving it: no holder', () => {
		const states = new Map<number, PeerState>([[1, { user: user('a') }]]);
		expect(holderOf('b1', states, fresh(states), now)).toBeNull();
	});

	it('one claim: that client holds it', () => {
		const states = new Map<number, PeerState>([
			[1, { user: user('a'), moving: moving('b1', 5) }],
			[2, { user: user('b'), moving: moving('other', 1) }]
		]);
		expect(holderOf('b1', states, fresh(states), now)).toMatchObject({ clientId: 1 });
	});

	it('a claim from a state not heard from in over 5 s does not count', () => {
		const states = new Map<number, PeerState>([[1, { user: user('a'), moving: moving('b1', 5) }]]);
		const seen = new Map([[1, now - STALE_MS - 1]]);
		expect(holderOf('b1', states, seen, now)).toBeNull();
	});

	it('two claims: the earlier one wins; equal times go to the lower client id', () => {
		const states = new Map<number, PeerState>([
			[7, { user: user('a'), moving: moving('b1', 20) }],
			[9, { user: user('b'), moving: moving('b1', 10) }]
		]);
		expect(holderOf('b1', states, fresh(states), now)?.clientId).toBe(9);
		states.set(9, { user: user('b'), moving: moving('b1', 20) });
		expect(holderOf('b1', states, fresh(states), now)?.clientId).toBe(7);
	});

	it('the local client counts like anyone (callers compare with their own id)', () => {
		const states = new Map<number, PeerState>([[3, { user: user('me'), moving: moving('b1', 1) }]]);
		// The local state has no lastSeen entry: it is never stale.
		expect(holderOf('b1', states, new Map(), now, 3)?.clientId).toBe(3);
	});
});

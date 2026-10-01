import { describe, expect, it } from 'vitest';
import canonJson from './fixture.json';
import riverbook from '../../../content/network/riverbook.json';
import { ageIn, aliveIn, filterNetwork, parseNetwork, type Network } from './canon';

const canon = (): Network => parseNetwork(structuredClone(canonJson));

describe('parseNetwork', () => {
	it('accepts a well-formed network', () => {
		const n = canon();
		expect(n.people.length).toBe(5);
		expect(n.links.every((l) => n.people.some((p) => p.id === l.source))).toBe(true);
	});

	it('the committed RIVERBOOK canon is valid (the riverbook-network skill relies on this)', () => {
		const n = parseNetwork(structuredClone(riverbook));
		expect(n.people.length).toBeGreaterThan(0);
	});

	it('rejects a link to someone who is not in the network', () => {
		const bad = structuredClone(canonJson);
		bad.links.push({ ...bad.links[0], id: 'ghost', target: 'nobody' });
		expect(() => parseNetwork(bad)).toThrow(/nobody/);
	});

	it('rejects duplicate ids and unknown stories', () => {
		const dup = structuredClone(canonJson);
		dup.people.push({ ...dup.people[0] });
		expect(() => parseNetwork(dup)).toThrow(/twice/);
		const story = structuredClone(canonJson);
		story.people[0].stories = ['nope'];
		expect(() => parseNetwork(story)).toThrow(/nope/);
	});
});

describe('ages', () => {
	const n = canon();
	const by = (id: string) => n.people.find((p) => p.id === id)!;

	it('reads ages from birth years, and null when the year is unknown', () => {
		expect(ageIn(by('mae'), 2060)).toBe(42);
		expect(ageIn(by('mae'), 2010)).toBeNull();
		expect(ageIn(by('kit'), 2060)).toBeNull();
	});

	it('is alive between birth and death; unknown years count as alive', () => {
		expect(aliveIn(by('nana-oi'), 2030)).toBe(true);
		expect(aliveIn(by('nana-oi'), 2036)).toBe(false);
		expect(aliveIn(by('mae'), 2017)).toBe(false);
		expect(aliveIn(by('kit'), 1990)).toBe(true);
	});
});

describe('filterNetwork', () => {
	it('keeps people in the chosen stories and drops links left dangling', () => {
		const n = canon();
		const view = filterNetwork(n, { stories: new Set(['raft']), institutions: true });
		const ids = new Set(view.people.map((p) => p.id));
		expect(ids.has('kit')).toBe(false);
		expect(ids.has('mae')).toBe(true);
		expect(view.links.every((l) => ids.has(l.source) && ids.has(l.target))).toBe(true);
	});

	it('hides institutions on request', () => {
		const view = filterNetwork(canon(), { stories: null, institutions: false });
		expect(view.people.some((p) => p.kind === 'institution')).toBe(false);
		expect(view.links.some((l) => l.target === 'guild')).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import type { StyleRef } from '$lib/styles/styles';
import { selectRefs } from './refs';

const ref = (role: StyleRef['role'], sort: number, label = ''): StyleRef => ({
	id: `r${sort}`,
	profileId: 'p',
	role,
	label,
	sort,
	width: 1,
	height: 1
});

describe('selectRefs', () => {
	it('keeps references in sort order within the per-role and total caps', () => {
		const refs = [
			ref('style', 0),
			ref('character', 1, 'Mae'),
			ref('style', 2),
			ref('style', 3),
			ref('style', 4),
			ref('object', 5, 'raft')
		];
		const { used, dropped } = selectRefs(refs, { maxRefs: 14, roleCaps: { style: 3 } });
		expect(used.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r5']);
		expect(dropped.map((r) => r.id)).toEqual(['r4']);
	});

	it('respects the total cap', () => {
		const refs = [ref('style', 0), ref('style', 1), ref('style', 2)];
		const { used, dropped } = selectRefs(refs, { maxRefs: 2 });
		expect(used).toHaveLength(2);
		expect(dropped).toHaveLength(1);
	});

	it('a text-only model takes none', () => {
		const { used, dropped } = selectRefs([ref('style', 0)], { maxRefs: 0 });
		expect(used).toEqual([]);
		expect(dropped).toHaveLength(1);
	});

	it('sorts by sort, whatever order they arrive in', () => {
		const { used } = selectRefs([ref('style', 2), ref('style', 1)], { maxRefs: 5 });
		expect(used.map((r) => r.sort)).toEqual([1, 2]);
	});
});

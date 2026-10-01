import { describe, expect, it } from 'vitest';
import type { CastMember, StyleRef } from '$lib/styles/styles';
import { planRefs } from './refs';

const ref = (id: string, sort: number, castId: string | null = null): StyleRef => ({
	id,
	profileId: 'p',
	role: castId ? 'character' : 'style',
	label: '',
	castId,
	sort,
	width: 1,
	height: 1
});

const member = (
	id: string,
	kind: CastMember['kind'] = 'character',
	portraitId: string | null = null
): CastMember => ({
	id,
	profileId: 'p',
	kind,
	name: id,
	aliases: [],
	description: `${id} described`,
	sort: 0,
	portraitId
});

const ids = (rs: { id: string }[]) => rs.map((r) => r.id);

describe('planRefs', () => {
	it('takes style references first, in sort order, within their cap', () => {
		const refs = [ref('s2', 2), ref('s0', 0), ref('s1', 1), ref('s3', 3)];
		const plan = planRefs(refs, { maxRefs: 14, roleCaps: { style: 3 } }, []);
		expect(ids(plan.used)).toEqual(['s0', 's1', 's2']);
		expect(ids(plan.dropped)).toEqual(['s3']);
		expect(plan.cast).toEqual([]);
	});

	it('sends no portrait of a member the panel does not need', () => {
		const refs = [ref('s0', 0), ref('mae1', 1, 'mae')];
		const plan = planRefs(refs, { maxRefs: 14 }, []);
		expect(ids(plan.used)).toEqual(['s0']);
		expect(plan.dropped).toEqual([]);
	});

	it('adds one portrait per member, the starred one, numbered after the style refs', () => {
		const refs = [
			ref('s0', 0),
			ref('mae1', 1, 'mae'),
			ref('mae2', 2, 'mae'),
			ref('raft1', 3, 'raft')
		];
		const plan = planRefs(refs, { maxRefs: 14 }, [
			member('raft', 'object'),
			member('mae', 'character', 'mae2')
		]);
		expect(ids(plan.used)).toEqual(['s0', 'raft1', 'mae2']);
		expect(plan.cast.map((c) => [c.member.id, c.image])).toEqual([
			['raft', 2],
			['mae', 3]
		]);
	});

	it('falls back to the first portrait when the starred one is gone', () => {
		const refs = [ref('mae2', 2, 'mae'), ref('mae1', 1, 'mae')];
		const plan = planRefs(refs, { maxRefs: 14 }, [member('mae', 'character', 'deleted')]);
		expect(ids(plan.used)).toEqual(['mae1']);
	});

	it('a member over the cap, or with no portrait, goes in as description only', () => {
		const refs = [ref('a1', 0, 'a'), ref('b1', 1, 'b'), ref('c1', 2, 'c')];
		const plan = planRefs(refs, { maxRefs: 14, roleCaps: { character: 2 } }, [
			member('a'),
			member('none'),
			member('b'),
			member('c')
		]);
		expect(ids(plan.used)).toEqual(['a1', 'b1']);
		expect(ids(plan.dropped)).toEqual(['c1']);
		expect(plan.cast.map((c) => [c.member.id, c.image])).toEqual([
			['a', 1],
			['none', null],
			['b', 2],
			['c', null]
		]);
	});

	it('props and places share the object cap; the total cap still holds', () => {
		const refs = [ref('s0', 0), ref('boat1', 1, 'boat'), ref('pier1', 2, 'pier')];
		const plan = planRefs(refs, { maxRefs: 2, roleCaps: { object: 5 } }, [
			member('boat', 'object'),
			member('pier', 'place')
		]);
		expect(ids(plan.used)).toEqual(['s0', 'boat1']);
		expect(ids(plan.dropped)).toEqual(['pier1']);
	});

	it('a text-only model takes no images but keeps every description', () => {
		const plan = planRefs([ref('s0', 0), ref('mae1', 1, 'mae')], { maxRefs: 0 }, [member('mae')]);
		expect(plan.used).toEqual([]);
		expect(plan.cast.map((c) => c.image)).toEqual([null]);
	});
});

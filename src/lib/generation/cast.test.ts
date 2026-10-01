import { describe, expect, it } from 'vitest';
import type { CastMember } from '$lib/styles/styles';
import { matchCast, resolveCast } from './cast';

const member = (id: string, name: string, aliases: string[] = []): CastMember => ({
	id,
	profileId: 'p',
	kind: 'character',
	name,
	aliases,
	description: '',
	sort: 0,
	portraitId: null
});

const ya = member('ya', 'Ya');
const dew = member('dew', 'Dew');
const grandmaDew = member('gdew', 'Grandma Dew');
const ismahan = member('ism', 'Ismahan at 42', ['Ismahan', 'the princess']);
const drone = member('drone', 'the drone');
const cast = [ya, dew, grandmaDew, ismahan, drone];

const ids = (ms: CastMember[]) => ms.map((m) => m.id);

describe('matchCast', () => {
	it('matches a name case-insensitively, on word boundaries', () => {
		expect(ids(matchCast('YA cooks rice', cast))).toEqual(['ya']);
		expect(ids(matchCast('a street in Yangon', cast))).toEqual([]);
		expect(ids(matchCast("Ya's grandmother", cast))).toEqual(['ya']);
	});

	it('prefers the longest match', () => {
		expect(ids(matchCast('Grandma Dew holds a grain of rice', cast))).toEqual(['gdew']);
		expect(ids(matchCast('Dew, then Grandma Dew', cast))).toEqual(['dew', 'gdew']);
	});

	it('honours aliases', () => {
		expect(ids(matchCast('the princess crouches in the mud', cast))).toEqual(['ism']);
		expect(ids(matchCast('Ismahan laughs', cast))).toEqual(['ism']);
	});

	it('returns members in the order the prompt first names them, once each', () => {
		expect(
			ids(matchCast('The drone hovers; Ya waves at the drone. Ismahan watches Ya.', cast))
		).toEqual(['drone', 'ya', 'ism']);
	});

	it('ignores empty names and aliases', () => {
		expect(ids(matchCast('anything at all', [member('x', '', ['', ' '])]))).toEqual([]);
	});

	it('treats regex characters in names literally', () => {
		const odd = member('odd', 'H-2-117 (tagged)');
		expect(ids(matchCast('subject H-2-117 (tagged) swims', [odd]))).toEqual(['odd']);
	});
});

describe('resolveCast', () => {
	it('auto-detects when there is no override', () => {
		expect(ids(resolveCast('Ya and the drone', cast, undefined))).toEqual(['ya', 'drone']);
	});

	it('an override replaces detection, in its own order, skipping members since deleted', () => {
		expect(ids(resolveCast('Ya and the drone', cast, ['ism', 'gone', 'dew']))).toEqual([
			'ism',
			'dew'
		]);
	});

	it('an empty override means nobody', () => {
		expect(resolveCast('Ya and the drone', cast, [])).toEqual([]);
	});
});

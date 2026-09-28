import { describe, expect, it } from 'vitest';
import { createComic } from './factory';
import { deserialize, serialize } from './serialize';
import { DOC_VERSION } from './types';

describe('serialize / deserialize', () => {
	it('round-trips a comic', () => {
		const comic = createComic('Round trip');
		expect(deserialize(serialize(comic))).toEqual(comic);
	});

	it('rejects a document from a newer version of the app', () => {
		const future = JSON.stringify({ ...createComic(), docVersion: DOC_VERSION + 1 });
		expect(() => deserialize(future)).toThrow(/newer/);
	});

	it('rejects something that is not a comic', () => {
		expect(() => deserialize('{"hello":1}')).toThrow(/not a comic/);
	});
});

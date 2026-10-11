import { describe, expect, it } from 'vitest';
import { bandsFor } from '$lib/model/bands';
import { createComic } from '$lib/model/factory';
import { DEFAULT_TYPOGRAPHY } from '$lib/typography/typography';
import { stableJson, thumbKey } from './key';

const comic = createComic('Raft');
const input = () => ({
	page: comic.pages[0],
	bands: bandsFor({ title: comic.title, bands: comic.bands, pageCount: 1 }, comic.pages[0], 0),
	typography: DEFAULT_TYPOGRAPHY
});

/** Reverse every object's key order, as jsonb hands rows back in its own order. */
const shuffled = (v: unknown): unknown =>
	Array.isArray(v)
		? v.map(shuffled)
		: v && typeof v === 'object'
			? Object.fromEntries(
					Object.entries(v)
						.reverse()
						.map(([k, x]) => [k, shuffled(x)])
				)
			: v;

describe('thumbnail key', () => {
	it('stableJson sorts keys at every depth and drops undefined', () => {
		expect(stableJson({ b: 1, a: { d: [{ z: 1, y: undefined, x: 2 }], c: undefined } })).toBe(
			'{"a":{"d":[{"x":2,"z":1}]},"b":1}'
		);
	});

	it('is the same for the editor’s comic and the stored JSON of it', async () => {
		const live = { ...input(), page: { ...input().page, stray: undefined } };
		const stored = shuffled(JSON.parse(JSON.stringify(input()))) as ReturnType<typeof input>;
		expect(await thumbKey(stored)).toBe(await thumbKey(live));
	});

	it('changes with page 1, the bands and the lettering', async () => {
		const base = await thumbKey(input());
		const merged = input();
		merged.page = { ...merged.page, panels: merged.page.panels.slice(1) };
		const retitled = input();
		retitled.bands = { ...retitled.bands, header: { ...retitled.bands.header, title: 'Other' } };
		const lettering = {
			...input(),
			typography: { ...DEFAULT_TYPOGRAPHY, speech: { ...DEFAULT_TYPOGRAPHY.speech, weight: 900 } }
		};
		for (const changed of [merged, retitled, lettering]) {
			expect(await thumbKey(changed)).not.toBe(base);
		}
	});

	it('is 16 lowercase hex characters', async () => {
		expect(await thumbKey(input())).toMatch(/^[0-9a-f]{16}$/);
	});
});

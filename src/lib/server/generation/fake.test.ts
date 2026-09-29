import { imageSize } from 'image-size';
import { describe, expect, it } from 'vitest';
import { modelFor } from '$lib/generation/models';
import { fakeProvider } from './fake';

describe('fakeProvider', () => {
	it('returns a real PNG in the requested shape', async () => {
		const out = await fakeProvider().generate({
			model: modelFor('fake')!,
			prompt: 'a heron',
			refs: [],
			aspect: '16:9'
		});
		expect(out.mimeType).toBe('image/png');
		const size = imageSize(out.bytes);
		expect(size.type).toBe('png');
		expect(size.width! / size.height!).toBeCloseTo(16 / 9, 1);
	});

	it('different prompts give different images', async () => {
		const gen = (prompt: string) =>
			fakeProvider().generate({ model: modelFor('fake')!, prompt, refs: [], aspect: '1:1' });
		const [a, b] = await Promise.all([gen('a'), gen('b')]);
		expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(false);
	});
});

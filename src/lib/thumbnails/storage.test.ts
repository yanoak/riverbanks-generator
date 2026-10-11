import { describe, expect, it } from 'vitest';
import { staleThumbs, thumbPath } from './storage';

const comic = '5a2cdb4a-c822-4fb3-bb5e-5f7d2656a420';

describe('thumbnail storage paths', () => {
	it('keeps a thumbnail in its comic’s folder, named by its key', () => {
		expect(thumbPath(comic, '0123456789abcdef')).toBe(`${comic}/thumb-0123456789abcdef.webp`);
	});

	it('picks the other thumbnails to remove, and never another asset', () => {
		const names = ['thumb-aaaa.webp', 'thumb-bbbb.webp', 'asset-1', 'thumbnail-art', 'cccc'];
		expect(staleThumbs(comic, 'bbbb', names)).toEqual([`${comic}/thumb-aaaa.webp`]);
	});
});

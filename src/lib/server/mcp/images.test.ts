import { describe, expect, it } from 'vitest';
import { assertFetchableUrl, readImage } from './images';

// 1×1 PNG
const PNG = Uint8Array.from(
	atob(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
	),
	(c) => c.charCodeAt(0)
);

const fakeFetch = (body: Uint8Array, type = 'image/png', status = 200) =>
	(async () =>
		new Response(body as unknown as BodyInit, {
			status,
			headers: { 'content-type': type }
		})) as typeof fetch;

describe('assertFetchableUrl', () => {
	it.each([
		['http://img.test/a.png', /https/],
		['https://localhost/a.png', /not allowed/],
		['https://127.0.0.1/a.png', /not allowed/],
		['https://10.1.2.3/a.png', /not allowed/],
		['https://192.168.0.5/a.png', /not allowed/],
		['https://169.254.169.254/latest', /not allowed/],
		['https://[::1]/a.png', /not allowed/],
		['https://metadata.google.internal/x', /not allowed/]
	])('rejects %s', (url, err) => {
		expect(() => assertFetchableUrl(url)).toThrow(err);
	});

	it('allows public https URLs', () => {
		expect(() => assertFetchableUrl('https://images.example.com/a.png')).not.toThrow();
	});
});

describe('readImage', () => {
	it('reads a URL and measures the image', async () => {
		const img = await readImage({ url: 'https://img.test/a.png' }, fakeFetch(PNG));
		expect(img).toMatchObject({ width: 1, height: 1, mimeType: 'image/png' });
		expect(img.bytes.byteLength).toBe(PNG.byteLength);
	});

	it('decodes base64 input', async () => {
		const img = await readImage({
			base64: btoa(String.fromCharCode(...PNG)),
			mimeType: 'image/png'
		});
		expect(img.width).toBe(1);
	});

	it('rejects non-images, bad statuses and oversized files', async () => {
		await expect(
			readImage({ url: 'https://a.test/x' }, fakeFetch(PNG, 'text/html'))
		).rejects.toThrow(/not an image/);
		await expect(
			readImage({ url: 'https://a.test/x' }, fakeFetch(PNG, 'image/png', 404))
		).rejects.toThrow(/404/);
		const big = new Uint8Array(11 * 1024 * 1024);
		await expect(readImage({ url: 'https://a.test/x' }, fakeFetch(big))).rejects.toThrow(/10 MB/);
	});

	it('follows redirects to a public host', async () => {
		const seen: string[] = [];
		const f = (async (url: URL | string) => {
			seen.push(String(url));
			if (String(url) === 'https://short.test/a')
				return new Response(null, { status: 302, headers: { location: 'https://cdn.test/a.png' } });
			return new Response(PNG as unknown as BodyInit, { headers: { 'content-type': 'image/png' } });
		}) as typeof fetch;
		const img = await readImage({ url: 'https://short.test/a' }, f);
		expect(img.width).toBe(1);
		expect(seen).toEqual(['https://short.test/a', 'https://cdn.test/a.png']);
	});

	it('resolves relative redirect locations', async () => {
		const seen: string[] = [];
		const f = (async (url: URL | string) => {
			seen.push(String(url));
			if (seen.length === 1)
				return new Response(null, { status: 301, headers: { location: '/b.png' } });
			return new Response(PNG as unknown as BodyInit, { headers: { 'content-type': 'image/png' } });
		}) as typeof fetch;
		await readImage({ url: 'https://img.test/a' }, f);
		expect(seen[1]).toBe('https://img.test/b.png');
	});

	it('rejects redirects to private hosts, to http, and endless chains', async () => {
		const redirectTo = (location: string) =>
			(async () => new Response(null, { status: 302, headers: { location } })) as typeof fetch;
		await expect(
			readImage({ url: 'https://a.test/x' }, redirectTo('https://169.254.169.254/latest'))
		).rejects.toThrow(/not allowed/);
		await expect(
			readImage({ url: 'https://a.test/x' }, redirectTo('http://a.test/y.png'))
		).rejects.toThrow(/https/);
		await expect(
			readImage({ url: 'https://a.test/x' }, redirectTo('https://a.test/x'))
		).rejects.toThrow(/too many redirects/i);
	});

	it('explains network failures instead of passing on "fetch failed"', async () => {
		const f = (async () => {
			throw new TypeError('fetch failed');
		}) as typeof fetch;
		await expect(readImage({ url: 'https://down.test/a.png' }, f)).rejects.toThrow(
			/could not reach down\.test/i
		);
	});

	it('rejects bytes that do not parse as an image', async () => {
		await expect(
			readImage({ url: 'https://a.test/x' }, fakeFetch(new Uint8Array([1, 2, 3])))
		).rejects.toThrow(/could not read/i);
	});
});

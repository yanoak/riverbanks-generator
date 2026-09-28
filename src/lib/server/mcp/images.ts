// Bringing images in for set_panel_image: fetch (or decode), validate, measure, then upload to
// the user's folder in the private 'assets' bucket.

import { imageSize } from 'image-size';
import type { SupabaseClient } from '@supabase/supabase-js';
import { newId } from '$lib/model/factory';
import { OpError } from '$lib/ops/ops';
import type { ImportedImage } from './server';

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

const PRIVATE_HOST =
	/^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;

/** Only public https URLs: a basic guard against the server being pointed at internal hosts. */
export function assertFetchableUrl(raw: string): URL {
	const url = new URL(raw);
	if (url.protocol !== 'https:') throw new OpError('invalid', 'Image URLs must use https.');
	if (PRIVATE_HOST.test(url.hostname))
		throw new OpError('invalid', 'That image host is not allowed.');
	return url;
}

interface ReadImage {
	bytes: Uint8Array;
	width: number;
	height: number;
	mimeType: string;
}

async function readCapped(res: Response): Promise<Uint8Array> {
	const reader = res.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BYTES) {
			await reader.cancel();
			throw new OpError('invalid', 'Images must be 10 MB or smaller.');
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}

const MAX_REDIRECTS = 5;

/** Follow redirects by hand so every hop passes assertFetchableUrl, not just the first. */
async function fetchPublic(raw: string, fetchImpl: typeof fetch): Promise<Response> {
	let url = assertFetchableUrl(raw);
	for (let hop = 0; ; hop++) {
		let res: Response;
		try {
			res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
		} catch {
			throw new OpError('invalid', `Could not reach ${url.hostname} to fetch the image.`);
		}
		const location = res.headers.get('location');
		if (res.status < 300 || res.status > 399 || !location) return res;
		if (hop >= MAX_REDIRECTS)
			throw new OpError('invalid', 'Too many redirects; give the final image URL instead.');
		url = assertFetchableUrl(new URL(location, url).href);
	}
}

export async function readImage(
	source: { url?: string; base64?: string; mimeType?: string },
	fetchImpl: typeof fetch = fetch
): Promise<ReadImage> {
	let bytes: Uint8Array;
	let mimeType = source.mimeType ?? '';
	if (source.url) {
		const res = await fetchPublic(source.url, fetchImpl);
		if (!res.ok) throw new OpError('invalid', `Fetching the image failed with HTTP ${res.status}.`);
		mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
		if (!TYPES.includes(mimeType))
			throw new OpError('invalid', `That URL is not an image (${mimeType || 'no type'}).`);
		bytes = await readCapped(res);
	} else {
		bytes = Uint8Array.from(atob(source.base64 ?? ''), (c) => c.charCodeAt(0));
		if (bytes.byteLength > MAX_BYTES)
			throw new OpError('invalid', 'Images must be 10 MB or smaller.');
	}
	let size: { width?: number; height?: number; type?: string };
	try {
		size = imageSize(bytes);
	} catch {
		throw new OpError('invalid', 'Could not read that file as an image.');
	}
	if (!size.width || !size.height)
		throw new OpError('invalid', 'Could not read that file as an image.');
	if (!mimeType) mimeType = size.type === 'jpg' ? 'image/jpeg' : `image/${size.type}`;
	if (!TYPES.includes(mimeType))
		throw new OpError('invalid', `Unsupported image type ${mimeType}.`);
	return { bytes, width: size.width, height: size.height, mimeType };
}

/** Upload into assets/<userId>/<assetId> as the user (storage RLS applies). */
export async function importImage(
	supabase: SupabaseClient,
	userId: string,
	source: { url?: string; base64?: string; mimeType?: string }
): Promise<ImportedImage> {
	const img = await readImage(source);
	const assetId = newId();
	const { error } = await supabase.storage
		.from('assets')
		.upload(`${userId}/${assetId}`, img.bytes, { contentType: img.mimeType });
	if (error) throw new Error(`Storing the image failed: ${error.message}`);
	return { assetId, naturalWidth: img.width, naturalHeight: img.height };
}

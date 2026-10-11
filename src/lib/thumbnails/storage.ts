// Thumbnails live beside the comic's images: assets/<comic id>/thumb-<key>.webp.
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'assets';

export const thumbPath = (comicId: string, key: string) => `${comicId}/thumb-${key}.webp`;

/** The comic's other thumbnails, as full paths: every thumb-*.webp but the current one. */
export function staleThumbs(comicId: string, key: string, names: string[]): string[] {
	const current = `thumb-${key}.webp`;
	return names
		.filter((n) => /^thumb-[0-9a-f]+\.webp$/.test(n) && n !== current)
		.map((n) => `${comicId}/${n}`);
}

/** Store a thumbnail, then remove the ones it replaces. */
export async function saveThumbnail(
	supabase: SupabaseClient,
	comicId: string,
	key: string,
	blob: Blob
): Promise<void> {
	const bucket = supabase.storage.from(BUCKET);
	const { error } = await bucket.upload(thumbPath(comicId, key), blob, {
		contentType: blob.type || 'image/webp',
		cacheControl: '31536000'
	});
	// Same key, same picture: someone else saved it first.
	if (error && !/exists|duplicate/i.test(error.message))
		throw new Error(`Saving the thumbnail failed: ${error.message}`);
	const { data } = await bucket.list(comicId, { search: 'thumb-' });
	const stale = staleThumbs(
		comicId,
		key,
		(data ?? []).map((f) => f.name)
	);
	if (stale.length) await bucket.remove(stale);
}

/** Signed URLs for the thumbnails that exist, by comic id; missing ones are left out. */
export async function signThumbnails(
	supabase: SupabaseClient,
	wanted: { comicId: string; key: string }[]
): Promise<Map<string, string>> {
	const urls = new Map<string, string>();
	if (!wanted.length) return urls;
	const byPath = new Map(wanted.map((w) => [thumbPath(w.comicId, w.key), w.comicId]));
	const { data } = await supabase.storage
		.from(BUCKET)
		.createSignedUrls([...byPath.keys()], 60 * 60 * 6);
	for (const item of data ?? []) {
		const comicId = item.path && byPath.get(item.path);
		if (comicId && item.signedUrl && !item.error) urls.set(comicId, item.signedUrl);
	}
	return urls;
}

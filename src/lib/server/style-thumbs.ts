// Signed URLs for reference images (the style-refs bucket is private), signed in one call.
import type { SupabaseClient } from '@supabase/supabase-js';
import { REFS_BUCKET, refPath, type StyleRef } from '$lib/styles/styles';

export async function signRefs(
	supabase: SupabaseClient,
	refs: StyleRef[]
): Promise<Record<string, string>> {
	if (!refs.length) return {};
	const { data } = await supabase.storage
		.from(REFS_BUCKET)
		.createSignedUrls(refs.map(refPath), 60 * 60 * 6);
	const urls: Record<string, string> = {};
	(data ?? []).forEach((d, i) => d.signedUrl && (urls[refs[i].id] = d.signedUrl));
	return urls;
}

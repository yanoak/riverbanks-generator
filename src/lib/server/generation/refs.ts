// Reading a profile's reference images out of Storage, as the signed-in user.
import type { SupabaseClient } from '@supabase/supabase-js';
import { REFS_BUCKET, refPath, type StyleRef } from '$lib/styles/styles';
import type { InlineImage } from './gemini';

export async function loadRefImages(
	supabase: SupabaseClient,
	refs: StyleRef[]
): Promise<InlineImage[]> {
	return Promise.all(
		refs.map(async (ref) => {
			const { data, error } = await supabase.storage.from(REFS_BUCKET).download(refPath(ref));
			if (error || !data) throw new Error(`Could not read a reference image: ${error?.message}`);
			return {
				bytes: new Uint8Array(await data.arrayBuffer()),
				mimeType: data.type || 'image/png'
			};
		})
	);
}

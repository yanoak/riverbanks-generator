import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetBackend } from './assets.svelte';

/** Images in the private 'assets' bucket at <user id>/<asset id>, read via signed URLs. */
export function supabaseAssets(supabase: SupabaseClient, userId: string): AssetBackend {
	const bucket = () => supabase.storage.from('assets');
	const path = (id: string) => `${userId}/${id}`;
	return {
		async put(id, blob) {
			const { error } = await bucket().upload(path(id), blob, {
				contentType: blob.type,
				upsert: true
			});
			if (error) throw new Error(`Uploading the image failed: ${error.message}`);
		},
		async url(id) {
			const { data } = await bucket().createSignedUrl(path(id), 60 * 60 * 6);
			return data?.signedUrl;
		},
		async blob(id) {
			const { data } = await bucket().download(path(id));
			return data ?? undefined;
		}
	};
}

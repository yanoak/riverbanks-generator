import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetBackend } from './assets.svelte';

/**
 * A comic's images in the private 'assets' bucket at <comic id>/<asset id>, readable by every
 * member, via signed URLs. Images saved before sharing live at <uploader's user id>/<asset id>:
 * when the uploader opens the comic they are copied into the comic's folder, so the others can
 * see them from then on.
 */
export function supabaseAssets(
	supabase: SupabaseClient,
	/** The comic, or (for pages showing several, like the comics list) each asset's comic. */
	comic: string | ((assetId: string) => string | undefined),
	userId: string
): AssetBackend {
	const bucket = () => supabase.storage.from('assets');
	const comicOf = typeof comic === 'string' ? () => comic : comic;
	const path = (id: string) => `${comicOf(id) ?? 'unknown'}/${id}`;
	const legacy = (id: string) => `${userId}/${id}`;

	/** Copy a pre-sharing image across; true if it now exists in the comic's folder. */
	async function adopt(id: string): Promise<boolean> {
		const { error } = await bucket().copy(legacy(id), path(id));
		return !error || /exists/i.test(error.message);
	}

	return {
		async put(id, blob) {
			const { error } = await bucket().upload(path(id), blob, {
				contentType: blob.type,
				upsert: true
			});
			if (error) throw new Error(`Uploading the image failed: ${error.message}`);
		},
		async url(id) {
			const sign = (p: string) => bucket().createSignedUrl(p, 60 * 60 * 6);
			const { data } = await sign(path(id));
			if (data?.signedUrl) return data.signedUrl;
			if (!(await adopt(id))) return undefined;
			return (await sign(path(id))).data?.signedUrl;
		},
		async blob(id) {
			const { data } = await bucket().download(path(id));
			if (data) return data;
			if (!(await adopt(id))) return undefined;
			return (await bucket().download(path(id))).data ?? undefined;
		}
	};
}

// Image blobs in IndexedDB, keyed by asset id. The document only holds ids; this module turns
// them into object URLs on demand and keeps them for the session.

import { browser } from '$app/environment';
import { createStore, get, set } from 'idb-keyval';
import { SvelteMap } from 'svelte/reactivity';
import { newId } from '$lib/model/factory';

const store = browser ? createStore('riverbanks-assets', 'assets') : undefined;
const urls = new SvelteMap<string, string>();

/** Where image blobs live. IndexedDB for /local; Supabase Storage when signed in. */
export interface AssetBackend {
	put(id: string, blob: Blob): Promise<void>;
	/** A URL the page can load (object URL or signed URL). */
	url(id: string): Promise<string | undefined>;
	blob(id: string): Promise<Blob | undefined>;
}

export const indexedDbAssets: AssetBackend = {
	put: (id, blob) => set(id, blob, store),
	url: async (id) => {
		const blob = await get<Blob>(id, store);
		return blob ? URL.createObjectURL(blob) : undefined;
	},
	blob: (id) => get<Blob>(id, store)
};

let backend: AssetBackend = indexedDbAssets;

/** Switch backends (the editor route does this on mount). Clears cached URLs. */
export function useAssetBackend(next: AssetBackend): void {
	backend = next;
	urls.clear();
	loading.clear();
}
// Only guards against duplicate reads; nothing renders from it.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const loading = new Set<string>();

export interface StoredImage {
	assetId: string;
	naturalWidth: number;
	naturalHeight: number;
}

export async function addImage(blob: Blob): Promise<StoredImage> {
	const bitmap = await createImageBitmap(blob);
	const image = { assetId: newId(), naturalWidth: bitmap.width, naturalHeight: bitmap.height };
	bitmap.close();
	await backend.put(image.assetId, blob);
	urls.set(image.assetId, URL.createObjectURL(blob));
	return image;
}

/** Reactive: undefined until the blob has been read from IndexedDB. */
export function assetUrl(id: string): string | undefined {
	const url = urls.get(id);
	if (url || !browser || loading.has(id)) return url;
	loading.add(id);
	backend.url(id).then((url) => {
		loading.delete(id);
		if (url) urls.set(id, url);
	});
	return undefined;
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
	return backend.blob(id);
}

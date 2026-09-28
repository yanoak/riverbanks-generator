// Image blobs in IndexedDB, keyed by asset id. The document only holds ids; this module turns
// them into object URLs on demand and keeps them for the session.

import { browser } from '$app/environment';
import { createStore, get, set } from 'idb-keyval';
import { SvelteMap } from 'svelte/reactivity';
import { newId } from '$lib/model/factory';

const store = browser ? createStore('riverbanks-assets', 'assets') : undefined;
const urls = new SvelteMap<string, string>();
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
	await set(image.assetId, blob, store);
	urls.set(image.assetId, URL.createObjectURL(blob));
	return image;
}

/** Reactive: undefined until the blob has been read from IndexedDB. */
export function assetUrl(id: string): string | undefined {
	const url = urls.get(id);
	if (url || !browser || loading.has(id)) return url;
	loading.add(id);
	get<Blob>(id, store).then((blob) => {
		loading.delete(id);
		if (blob) urls.set(id, URL.createObjectURL(blob));
	});
	return undefined;
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
	return get<Blob>(id, store);
}

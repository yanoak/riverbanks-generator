// Bring the /local IndexedDB comic (and its images) into the signed-in account.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Comic } from '$lib/model/types';
import { indexedDbAssets } from './assets.svelte';
import { supabaseAssets } from './cloud-assets';
import { localSource } from './local-source';
import { initialState } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from './supabase-store';

export async function findLocalComic(): Promise<Comic | null> {
	try {
		return await localSource.load();
	} catch {
		return null;
	}
}

/** Uploads every image the comic uses, then creates it; returns the new comic id. */
export async function importLocalComic(
	supabase: SupabaseClient,
	userId: string,
	comic: Comic
): Promise<string> {
	const cloud = supabaseAssets(supabase, userId);
	const ids = new Set(
		comic.pages.flatMap((p) =>
			p.panels.flatMap((panel) => (panel.image ? [panel.image.assetId] : []))
		)
	);
	for (const id of ids) {
		const blob = await indexedDbAssets.blob(id);
		if (blob) await cloud.put(id, blob);
	}
	const record = await new SupabaseComicStore(supabase).create(
		comic.title,
		comic,
		initialState(comic)
	);
	return record.id;
}

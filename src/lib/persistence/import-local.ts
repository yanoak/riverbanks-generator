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

/** Creates the comic, then uploads every image it uses into its folder; returns its id. */
export async function importLocalComic(
	supabase: SupabaseClient,
	userId: string,
	comic: Comic
): Promise<string> {
	const record = await new SupabaseComicStore(supabase).create(
		comic.title,
		comic,
		initialState(comic)
	);
	const cloud = supabaseAssets(supabase, record.id, userId);
	const ids = new Set(
		comic.pages.flatMap((p) =>
			p.panels.flatMap((panel) => (panel.image ? [panel.image.assetId] : []))
		)
	);
	for (const id of ids) {
		const blob = await indexedDbAssets.blob(id);
		if (blob) await cloud.put(id, blob);
	}
	return record.id;
}

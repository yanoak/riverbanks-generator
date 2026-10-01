// Reading and saving a story network. Anyone reads it (the page is public); signed-in members save
// it. Saving also publishes the cast portraits it names, because styles themselves are private.

import type { SupabaseClient } from '@supabase/supabase-js';
import { REFS_BUCKET, getProfile, refPath } from '$lib/styles/styles';
import { parseNetwork, type Network } from './canon';

export const DEFAULT_NETWORK = 'riverbook';
export const PORTRAITS_BUCKET = 'network-portraits';

export interface StoredNetwork {
	network: Network;
	syncedAt: string;
}

export async function getNetwork(
	supabase: SupabaseClient,
	id = DEFAULT_NETWORK
): Promise<StoredNetwork | null> {
	const { data, error } = await supabase
		.from('story_network')
		.select('data, synced_at')
		.eq('id', id)
		.maybeSingle();
	if (error) throw new Error(`Could not load the story network: ${error.message}`);
	if (!data) return null;
	return { network: parseNetwork(data.data), syncedAt: data.synced_at as string };
}

/**
 * Copy each portrait the network names from its style's cast into the public bucket, and record
 * the public url on it. Uses the member's starred portrait, else its first.
 */
async function publishPortraits(supabase: SupabaseClient, network: Network, id: string) {
	const wanted = network.people.flatMap((p) => p.portraits);
	if (!wanted.length) return;
	const styleId = network.meta.styleProfileId;
	if (!styleId)
		throw new Error('Portraits need meta.styleProfileId: the style whose cast they come from.');
	const style = await getProfile(supabase, styleId);
	if (!style) throw new Error(`No style ${styleId}: it may have been deleted.`);

	const done = new Map<string, { url: string; width: number; height: number }>();
	for (const portrait of wanted) {
		const member = style.cast.find(
			(m) => m.name.toLowerCase() === portrait.cast.trim().toLowerCase()
		);
		if (!member) throw new Error(`${style.name} has no cast member “${portrait.cast}”.`);
		if (!done.has(member.id)) {
			const own = style.refs.filter((r) => r.castId === member.id);
			const ref = own.find((r) => r.id === member.portraitId) ?? own[0];
			if (!ref) throw new Error(`${member.name} has no portrait yet: draw or upload one first.`);
			const file = await supabase.storage.from(REFS_BUCKET).download(refPath(ref));
			if (file.error || !file.data) throw new Error(`Could not read ${member.name}’s portrait.`);
			const path = `${id}/${member.id}`;
			const up = await supabase.storage
				.from(PORTRAITS_BUCKET)
				.upload(path, file.data, { contentType: file.data.type || 'image/png', upsert: true });
			if (up.error)
				throw new Error(`Could not publish ${member.name}’s portrait: ${up.error.message}`);
			// The ref id busts caches when a different portrait gets starred.
			const url = supabase.storage.from(PORTRAITS_BUCKET).getPublicUrl(path).data.publicUrl;
			done.set(member.id, {
				url: `${url}?v=${ref.id.slice(0, 8)}`,
				width: ref.width,
				height: ref.height
			});
		}
		Object.assign(portrait, done.get(member.id));
	}
}

/** Validate, publish its portraits, then replace the whole network. Returns what was saved. */
export async function saveNetwork(
	supabase: SupabaseClient,
	input: unknown,
	id = DEFAULT_NETWORK
): Promise<Network> {
	const network = parseNetwork(input);
	await publishPortraits(supabase, network, id);
	const { error } = await supabase
		.from('story_network')
		.upsert({ id, data: network, synced_at: new Date().toISOString() });
	if (error) throw new Error(`Could not save the story network: ${error.message}`);
	return network;
}

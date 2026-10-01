// Reading and saving a story network, as the signed-in user (RLS: any team member).

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseNetwork, type Network } from './canon';

export const DEFAULT_NETWORK = 'riverbook';

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

/** Validate, then replace the whole network. Returns what was saved. */
export async function saveNetwork(
	supabase: SupabaseClient,
	input: unknown,
	id = DEFAULT_NETWORK
): Promise<Network> {
	const network = parseNetwork(input);
	const { error } = await supabase
		.from('story_network')
		.upsert({ id, data: network, synced_at: new Date().toISOString() });
	if (error) throw new Error(`Could not save the story network: ${error.message}`);
	return network;
}

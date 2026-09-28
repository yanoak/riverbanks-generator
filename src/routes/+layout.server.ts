import { supabaseEnv } from '$lib/server/supabase-env';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { url, key } = supabaseEnv();
	return { user: (await locals.getUser?.()) ?? null, supabase: { url, key } };
};

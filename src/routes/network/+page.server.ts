import { error } from '@sveltejs/kit';
import { getNetwork } from '$lib/network/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		return { stored: await getNetwork(locals.supabase) };
	} catch (e) {
		error(500, (e as Error).message);
	}
};

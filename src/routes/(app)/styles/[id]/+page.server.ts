import { error } from '@sveltejs/kit';
import { MODELS, toOption } from '$lib/generation/models';
import { signRefs } from '$lib/server/style-thumbs';
import { getProfile } from '$lib/styles/styles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const profile = await getProfile(locals.supabase, params.id);
	if (!profile) error(404, 'Style not found');
	const user = await locals.getUser();
	return {
		profile,
		thumbs: await signRefs(locals.supabase, profile.refs),
		canEdit: profile.createdBy === user?.id,
		// Every real model, configured here or not: a style outlives this server's keys.
		models: MODELS.filter((m) => m.provider !== 'fake').map(toOption)
	};
};

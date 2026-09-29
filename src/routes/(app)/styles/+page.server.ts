import { error, redirect } from '@sveltejs/kit';
import { signRefs } from '$lib/server/style-thumbs';
import { createProfile, listProfiles } from '$lib/styles/styles';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	let profiles;
	try {
		profiles = await listProfiles(locals.supabase);
	} catch (e) {
		error(500, (e as Error).message);
	}
	return {
		profiles,
		thumbs: await signRefs(
			locals.supabase,
			profiles.flatMap((p) => p.refs.slice(0, 4))
		)
	};
};

export const actions: Actions = {
	create: async ({ locals }) => {
		redirect(303, `/styles/${await createProfile(locals.supabase)}`);
	}
};

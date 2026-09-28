import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const password = String((await request.formData()).get('password') ?? '');
		if (password.length < 8)
			return fail(400, { error: 'Use a password of at least 8 characters.' });
		const { error } = await locals.supabase.auth.updateUser({ password });
		if (error) return fail(400, { error: error.message });
		redirect(303, '/comics');
	}
};

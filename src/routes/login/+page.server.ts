import { fail, redirect } from '@sveltejs/kit';
import { safeNext } from '$lib/server/redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (await locals.getUser()) redirect(303, safeNext(url.searchParams.get('redirectTo')));
	return { notice: url.searchParams.get('notice'), error: url.searchParams.get('error') };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { email, error: 'Enter your email and password.' });
		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) {
			return fail(400, { email, error: 'That email and password don’t match.' });
		}
		redirect(303, safeNext(url.searchParams.get('redirectTo')));
	}
};

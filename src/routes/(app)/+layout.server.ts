import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = await locals.getUser();
	if (!user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	return { user };
};

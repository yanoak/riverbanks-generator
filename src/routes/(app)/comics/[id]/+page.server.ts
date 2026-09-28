import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	// The document itself is loaded (and kept live) in the browser; this only checks access.
	const { data } = /^[0-9a-f-]{36}$/i.test(params.id)
		? await locals.supabase.from('comics').select('id, title').eq('id', params.id).maybeSingle()
		: { data: null };
	if (!data) error(404, 'Comic not found');
	return {
		comic: { id: data.id as string, title: data.title as string },
		page: Math.max(1, Number(url.searchParams.get('page')) || 1)
	};
};

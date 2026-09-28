import { error } from '@sveltejs/kit';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const record = await new SupabaseComicStore(locals.supabase).get(params.id);
	if (!record) error(404, 'Comic not found');
	return {
		comic: { id: record.id, doc: record.doc, rev: record.rev, title: record.title },
		page: Math.max(1, Number(url.searchParams.get('page')) || 1)
	};
};

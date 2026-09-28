import { error, fail, redirect } from '@sveltejs/kit';
import { createComic } from '$lib/model/factory';
import type { Page } from '$lib/model/types';
import { mutateComic } from '$lib/ops/ops';
import { initialState } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { data, error: err } = await locals.supabase
		.from('comics')
		.select('id, title, updated_at, pages:doc->pages, firstPage:doc->pages->0')
		.order('updated_at', { ascending: false });
	if (err) error(500, `Could not load your comics: ${err.message}`);
	return {
		comics: (data ?? []).map((r) => ({
			id: r.id as string,
			title: r.title as string,
			updatedAt: r.updated_at as string,
			pageCount: Array.isArray(r.pages) ? r.pages.length : 0,
			firstPage: r.firstPage as Page | null
		}))
	};
};

export const actions: Actions = {
	create: async ({ locals }) => {
		const comic = createComic('Untitled comic');
		const record = await new SupabaseComicStore(locals.supabase).create(
			comic.title,
			comic,
			initialState(comic)
		);
		redirect(303, `/comics/${record.id}`);
	},
	rename: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id'));
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'A title can’t be empty.' });
		try {
			await mutateComic(new SupabaseComicStore(locals.supabase), id, (comic) => {
				comic.title = title;
				return '';
			});
		} catch {
			return fail(404, { error: 'That comic no longer exists.' });
		}
	},
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id'));
		await new SupabaseComicStore(locals.supabase).delete(id);
	}
};

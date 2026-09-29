import { error, fail, redirect } from '@sveltejs/kit';
import { createComic } from '$lib/model/factory';
import type { Page } from '$lib/model/types';
import { mutateComic } from '$lib/ops/ops';
import { initialState } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import { listProfiles, summarize } from '$lib/styles/styles';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [comics, owners, user, styles] = await Promise.all([
		locals.supabase
			.from('comics')
			.select('id, title, owner_id, updated_at, pages:doc->pages, firstPage:doc->pages->0')
			.order('updated_at', { ascending: false }),
		locals.supabase.rpc('shared_comic_owners'),
		locals.getUser(),
		listProfiles(locals.supabase).catch(() => [])
	]);
	if (comics.error) error(500, `Could not load your comics: ${comics.error.message}`);
	const ownerEmail = new Map(
		((owners.data ?? []) as { comic_id: string; email: string }[]).map((o) => [o.comic_id, o.email])
	);
	return {
		styles: styles.map(summarize),
		comics: (comics.data ?? []).map((r) => ({
			id: r.id as string,
			title: r.title as string,
			updatedAt: r.updated_at as string,
			pageCount: Array.isArray(r.pages) ? r.pages.length : 0,
			firstPage: r.firstPage as Page | null,
			/** Set for comics someone else owns and shared with me. */
			sharedBy: r.owner_id === user?.id ? null : (ownerEmail.get(r.id as string) ?? 'someone')
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim() || 'Untitled comic';
		const style = String(form.get('style') ?? '');
		const comic = createComic(title.slice(0, 200));
		if (/^[0-9a-f-]{36}$/i.test(style)) comic.styleProfileId = style;
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

import { error, fail, redirect } from '@sveltejs/kit';
import { createComic, DEFAULT_FORMAT } from '$lib/model/factory';
import type { Bands, Page } from '$lib/model/types';
import { mutateComic } from '$lib/ops/ops';
import { initialState } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import { listProfiles, summarize } from '$lib/styles/styles';
import { bandsFor } from '$lib/model/bands';
import { thumbKey } from '$lib/thumbnails/key';
import { signThumbnails } from '$lib/thumbnails/storage';
import { DEFAULT_TYPOGRAPHY } from '$lib/typography/typography';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [comics, owners, user, styles] = await Promise.all([
		locals.supabase
			.from('comics')
			.select(
				'id, title, owner_id, updated_at, archived_at, styleProfileId:doc->>styleProfileId, bands:doc->bands, pages:doc->pages, firstPage:doc->pages->0'
			)
			.order('updated_at', { ascending: false }),
		locals.supabase.rpc('shared_comic_owners'),
		locals.getUser(),
		listProfiles(locals.supabase).catch(() => [])
	]);
	if (comics.error) error(500, `Could not load your comics: ${comics.error.message}`);
	const ownerEmail = new Map(
		((owners.data ?? []) as { comic_id: string; email: string }[]).map((o) => [o.comic_id, o.email])
	);
	const summaries = styles.map(summarize);
	const rows = (comics.data ?? []).map((r) => ({
		id: r.id as string,
		title: r.title as string,
		updatedAt: r.updated_at as string,
		archivedAt: (r.archived_at as string | null) ?? null,
		pageCount: Array.isArray(r.pages) ? r.pages.length : 0,
		firstPage: r.firstPage as Page | null,
		bands: (r.bands as Bands | null) ?? undefined,
		styleProfileId: (r.styleProfileId as string | null) ?? null,
		/** Set for comics someone else owns and shared with me. */
		sharedBy: r.owner_id === user?.id ? null : (ownerEmail.get(r.id as string) ?? 'someone')
	}));
	// Each card's thumbnail is named by what it shows (plans/2026-10-11_comic-thumbnails.plan.md).
	const keyed = await Promise.all(
		rows.map(async (c) => ({
			comicId: c.id,
			key: c.firstPage
				? await thumbKey({
						page: c.firstPage,
						bands: bandsFor(c, c.firstPage, 0),
						typography:
							summaries.find((s) => s.id === c.styleProfileId)?.typography ?? DEFAULT_TYPOGRAPHY
					})
				: null
		}))
	);
	const urls = await signThumbnails(
		locals.supabase,
		keyed.filter((k): k is { comicId: string; key: string } => !!k.key)
	).catch(() => new Map<string, string>());
	return {
		styles: summaries,
		comics: rows.map((c, i) => ({
			...c,
			thumbKey: keyed[i].key,
			/** Null until a thumbnail of the current page 1 is saved; the card is then drawn live. */
			thumbUrl: urls.get(c.id) ?? null
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim() || 'Untitled comic';
		const style = String(form.get('style') ?? '');
		const comic = createComic(title.slice(0, 200), DEFAULT_FORMAT);
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
	archive: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id'));
		if (!(await new SupabaseComicStore(locals.supabase).archive(id)))
			return fail(403, { error: 'Only the comic’s owner can archive it.' });
		return { archived: id };
	},
	restore: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id'));
		if (!(await new SupabaseComicStore(locals.supabase).restore(id)))
			return fail(403, { error: 'Only the comic’s owner can restore it.' });
		return { restored: id };
	},
	/** Permanent; the database refuses a comic that is not archived. */
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id'));
		if (!(await new SupabaseComicStore(locals.supabase).delete(id)))
			return fail(400, { error: 'Archive a comic before deleting it.' });
	}
};

import { error, json } from '@sveltejs/kit';
import { OpError } from '$lib/ops/ops';
import { generatePanelImage } from '$lib/server/generation/generate';
import { providerFor } from '$lib/server/generation/providers';
import type { RequestHandler } from './$types';

// Image models take 10–40 s, Higgsfield's queue can take minutes.
export const config = { maxDuration: 300 };

const STATUS = { 'not-found': 403, invalid: 400, conflict: 409 } as const;

/** Generate a panel's image into the comic's assets; the editor then places it (undoably). */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!(await locals.getUser())) error(401, 'Sign in first.');
	const body = await request.json().catch(() => null);
	const box = body?.box;
	if (
		typeof body?.comicId !== 'string' ||
		typeof body?.panelId !== 'string' ||
		typeof body?.prompt !== 'string' ||
		!(box?.w > 0 && box?.h > 0)
	)
		error(400, 'Expected comicId, panelId, prompt and box {w, h}.');
	try {
		return json(
			await generatePanelImage(
				locals.supabase,
				{
					comicId: body.comicId,
					panelId: body.panelId,
					prompt: body.prompt,
					profileId: typeof body.profileId === 'string' ? body.profileId : undefined,
					modelKey: typeof body.model === 'string' ? body.model : undefined,
					box: { w: Number(box.w), h: Number(box.h) },
					quality: body.quality === 'print' ? 'print' : 'draft',
					sourceAssetId: typeof body.sourceAssetId === 'string' ? body.sourceAssetId : undefined
				},
				{ provider: providerFor, signal: request.signal }
			)
		);
	} catch (e) {
		if (e instanceof OpError) error(STATUS[e.code], e.message);
		error(502, (e as Error).message);
	}
};

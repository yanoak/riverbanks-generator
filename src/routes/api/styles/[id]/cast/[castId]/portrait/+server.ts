import { error, json } from '@sveltejs/kit';
import { OpError } from '$lib/ops/ops';
import { generatePortrait } from '$lib/server/generation/portrait';
import { providerFor } from '$lib/server/generation/providers';
import { signRefs } from '$lib/server/style-thumbs';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 300 };

const STATUS = { 'not-found': 404, invalid: 400, conflict: 409 } as const;

/** Draw a reference sheet for one cast member in its style. Creator only (RLS on insert). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!(await locals.getUser())) error(401, 'Sign in first.');
	const body = await request.json().catch(() => ({}));
	try {
		const ref = await generatePortrait(
			locals.supabase,
			{
				profileId: params.id,
				castId: params.castId,
				modelKey: typeof body?.model === 'string' ? body.model : undefined
			},
			{ provider: providerFor, signal: request.signal }
		);
		const urls = await signRefs(locals.supabase, [ref]);
		return json({ ref, url: urls[ref.id] });
	} catch (e) {
		if (e instanceof OpError) error(STATUS[e.code], e.message);
		error(502, (e as Error).message);
	}
};

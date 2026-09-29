import { error, json } from '@sveltejs/kit';
import { describeStyle } from '$lib/server/generation/describe';
import { NO_GEMINI, geminiKey, useFake } from '$lib/server/generation/env';
import { loadRefImages } from '$lib/server/generation/refs';
import { getProfile } from '$lib/styles/styles';
import type { RequestHandler } from './$types';

const FAKE = {
	style: 'Fake style: loose ink with flat washes.',
	palette: [
		{ hex: '#1d3557', name: 'deep navy' },
		{ hex: '#e76f51', name: 'terracotta' }
	],
	avoid: 'gradients'
};

/** Draft the profile's style, palette and avoid list from its references. Creator only. */
export const POST: RequestHandler = async ({ params, locals }) => {
	const user = await locals.getUser();
	if (!user) error(401, 'Sign in first.');
	const profile = await getProfile(locals.supabase, params.id);
	if (!profile) error(404, 'That style no longer exists.');
	if (profile.createdBy !== user.id)
		error(403, 'Only the person who made this style can change it.');
	if (useFake()) return json(FAKE);
	const apiKey = geminiKey();
	if (!apiKey) error(503, NO_GEMINI);

	// Style references describe the look best; fall back to all of them.
	const styled = profile.refs.filter((r) => r.role === 'style');
	const images = await loadRefImages(locals.supabase, styled.length ? styled : profile.refs);
	try {
		return json(await describeStyle(images, { apiKey, signal: AbortSignal.timeout(60_000) }));
	} catch (e) {
		error(502, (e as Error).message);
	}
};

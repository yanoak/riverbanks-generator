import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase/server';

export const handle: Handle = async ({ event, resolve }) => {
	// /mcp authenticates with bearer tokens, not cookies.
	if (event.url.pathname.startsWith('/mcp') || event.url.pathname.startsWith('/.well-known')) {
		return resolve(event);
	}

	event.locals.supabase = createSupabaseServerClient(event.cookies);

	let user: Awaited<ReturnType<App.Locals['getUser']>> | undefined;
	/** The signed-in user, from a verified JWT (getClaims checks the signature against the JWKS). */
	event.locals.getUser = async () => {
		if (user !== undefined) return user;
		const { data, error } = await event.locals.supabase.auth.getClaims();
		const claims = data?.claims;
		user = !error && claims?.sub ? { id: claims.sub, email: (claims.email as string) ?? '' } : null;
		return user;
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

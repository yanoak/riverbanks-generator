// OAuth consent for MCP clients. Supabase Auth's OAuth 2.1 server sends the browser here with
// ?authorization_id=…; the (app) layout has already made sure someone is signed in.

import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const SCOPE_TEXT: Record<string, string> = {
	openid: 'Confirm who you are',
	email: 'See your email address',
	profile: 'See your basic profile'
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const id = url.searchParams.get('authorization_id');
	if (!id) error(400, 'Missing authorization request.');
	const { data, error: err } = await locals.supabase.auth.oauth.getAuthorizationDetails(id);
	if (err || !data)
		error(400, `This sign-in request is invalid or has expired. ${err?.message ?? ''}`);
	// Already approved these scopes before: go straight back to the client.
	if (!('authorization_id' in data)) redirect(303, data.redirect_url);
	return {
		authorizationId: data.authorization_id,
		client: {
			name: data.client.name || 'An application',
			uri: data.client.uri,
			logo: data.client.logo_uri
		},
		redirectHost: new URL(data.redirect_uri).host,
		email: data.user.email,
		scopes: data.scope
			.split(' ')
			.filter(Boolean)
			.map((s) => SCOPE_TEXT[s] ?? s)
	};
};

async function decide(request: Request, locals: App.Locals, approve: boolean) {
	const id = String((await request.formData()).get('authorization_id') ?? '');
	const api = locals.supabase.auth.oauth;
	const { data, error: err } = approve
		? await api.approveAuthorization(id, { skipBrowserRedirect: true })
		: await api.denyAuthorization(id, { skipBrowserRedirect: true });
	if (err || !data) return fail(400, { error: err?.message ?? 'Could not complete the request.' });
	redirect(303, data.redirect_url);
}

export const actions: Actions = {
	approve: ({ request, locals }) => decide(request, locals, true),
	deny: ({ request, locals }) => decide(request, locals, false)
};

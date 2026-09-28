// Run the MCP OAuth flow as a client would, against local Supabase: discovery → dynamic client
// registration → PKCE authorize → sign in + Allow in the browser → code exchange.

import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { PASSWORD } from './accounts';

export const APP = 'http://localhost:4318';
export const CALLBACK = 'http://localhost:4318/__oauth-callback';
const b64url = (b: Buffer) => b.toString('base64url');

export async function discover(request: APIRequestContext) {
	const challenge = (await request.post('/mcp', { data: {} })).headers()['www-authenticate'];
	const metadataUrl = challenge.match(/resource_metadata="([^"]+)"/)![1];
	const issuer = (await (await request.get(metadataUrl)).json()).authorization_servers[0] as string;
	return (await (await request.get(`${issuer}/.well-known/oauth-authorization-server`)).json()) as {
		registration_endpoint: string;
		authorization_endpoint: string;
		token_endpoint: string;
	};
}

export async function register(request: APIRequestContext, endpoint: string, name: string) {
	const reg = await (
		await request.post(endpoint, {
			data: {
				client_name: name,
				redirect_uris: [CALLBACK],
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none'
			}
		})
	).json();
	expect(reg.client_id).toBeTruthy();
	return reg.client_id as string;
}

/** Build a PKCE authorize URL; returns it with its verifier. */
export function authorizeUrl(endpoint: string, clientId: string, state = 'xyz') {
	const verifier = b64url(randomBytes(32));
	const url = new URL(endpoint);
	url.search = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: CALLBACK,
		code_challenge: b64url(createHash('sha256').update(verifier).digest()),
		code_challenge_method: 'S256',
		scope: 'openid email',
		state,
		resource: `${APP}/mcp`
	}).toString();
	return { url, verifier };
}

/**
 * Local Supabase redirects authorization to its site_url (the dev port). Follow that one hop
 * ourselves and open the same consent path on the test server instead.
 */
export async function openConsent(page: Page, request: APIRequestContext, authorize: URL) {
	const res = await request.get(authorize.toString(), { maxRedirects: 0 });
	const location = new URL(res.headers()['location']);
	expect(location.pathname).toBe('/oauth/consent');
	await page.route(`${CALLBACK}**`, (route) =>
		route.fulfill({ status: 200, body: 'callback reached' })
	);
	await page.goto(`${APP}${location.pathname}${location.search}`);
}

export async function signInOnPage(page: Page, email: string) {
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function exchange(
	request: APIRequestContext,
	tokenEndpoint: string,
	clientId: string,
	code: string,
	verifier: string
): Promise<string> {
	const token = await (
		await request.post(tokenEndpoint, {
			form: {
				grant_type: 'authorization_code',
				code,
				redirect_uri: CALLBACK,
				client_id: clientId,
				code_verifier: verifier
			}
		})
	).json();
	expect(token.access_token).toBeTruthy();
	return token.access_token as string;
}

/**
 * A full OAuth access token for `email`, as an MCP client would hold. Uses (and leaves signed
 * in) `page`; if the page is already signed in, the login step is skipped.
 */
export async function oauthToken(
	page: Page,
	request: APIRequestContext,
	email: string,
	name = 'E2E MCP client'
) {
	const as = await discover(request);
	const clientId = await register(request, as.registration_endpoint, name);
	const { url, verifier } = authorizeUrl(as.authorization_endpoint, clientId);
	await openConsent(page, request, url);
	if (page.url().includes('/login')) await signInOnPage(page, email);
	await page.getByRole('button', { name: 'Allow' }).click();
	await page.waitForURL(`${CALLBACK}**`);
	const code = new URL(page.url()).searchParams.get('code')!;
	return exchange(request, as.token_endpoint, clientId, code, verifier);
}

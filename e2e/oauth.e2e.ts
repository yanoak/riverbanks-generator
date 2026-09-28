// The full MCP OAuth flow, with this test playing the MCP client:
// discovery → dynamic registration → PKCE authorize → sign in + consent → token → /mcp.
import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHash, randomBytes } from 'node:crypto';
import { createUser, PASSWORD } from './support/accounts';

const APP = 'http://localhost:4318';
const CALLBACK = 'http://localhost:4318/__oauth-callback';
const b64url = (b: Buffer) => b.toString('base64url');

/**
 * Local Supabase redirects authorization to its site_url (the dev port). Follow that one hop
 * ourselves and open the same consent path on the test server instead.
 */
async function openConsent(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext,
	authorize: URL
) {
	const res = await request.get(authorize.toString(), { maxRedirects: 0 });
	const location = new URL(res.headers()['location']);
	expect(location.pathname).toBe('/oauth/consent');
	await page.goto(`${APP}${location.pathname}${location.search}`);
}

test('an MCP client signs in through OAuth consent and calls /mcp', async ({ page, request }) => {
	const user = await createUser('oauth');

	// 1. The 401 challenge leads to our metadata, which names Supabase Auth as the issuer.
	const challenge = (await request.post('/mcp', { data: {} })).headers()['www-authenticate'];
	const metadataUrl = challenge.match(/resource_metadata="([^"]+)"/)![1];
	const issuer = (await (await request.get(metadataUrl)).json()).authorization_servers[0] as string;
	const as = await (await request.get(`${issuer}/.well-known/oauth-authorization-server`)).json();
	expect(as.registration_endpoint).toBeTruthy();

	// 2. Dynamic client registration.
	const reg = await (
		await request.post(as.registration_endpoint, {
			data: {
				client_name: 'E2E MCP client',
				redirect_uris: [CALLBACK],
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none'
			}
		})
	).json();
	expect(reg.client_id).toBeTruthy();

	// 3. PKCE authorization request in the browser.
	const verifier = b64url(randomBytes(32));
	const challengeHash = b64url(createHash('sha256').update(verifier).digest());
	const authorize = new URL(as.authorization_endpoint);
	authorize.search = new URLSearchParams({
		response_type: 'code',
		client_id: reg.client_id,
		redirect_uri: CALLBACK,
		code_challenge: challengeHash,
		code_challenge_method: 'S256',
		scope: 'openid email',
		state: 'xyz',
		resource: `${APP}/mcp`
	}).toString();

	await page.route(`${CALLBACK}**`, (route) =>
		route.fulfill({ status: 200, body: 'callback reached' })
	);
	await openConsent(page, request, authorize);
	// 4. Not signed in yet: login first, then back to consent.
	await page.waitForURL(/\/login\?redirectTo=%2Foauth%2Fconsent/);
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByLabel('Email').fill(user.email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(
		page.getByRole('heading', { name: /E2E MCP client wants to use your Riverbanks account/ })
	).toBeVisible();
	await expect(page.getByText('Read, create, edit and delete your comics')).toBeVisible();
	await page.getByRole('button', { name: 'Allow' }).click();
	await page.waitForURL(`${CALLBACK}**`);
	const back = new URL(page.url());
	expect(back.searchParams.get('state')).toBe('xyz');
	const code = back.searchParams.get('code')!;

	// 5. Code → token.
	const token = await (
		await request.post(as.token_endpoint, {
			form: {
				grant_type: 'authorization_code',
				code,
				redirect_uri: CALLBACK,
				client_id: reg.client_id,
				code_verifier: verifier
			}
		})
	).json();
	expect(token.access_token).toBeTruthy();

	// 6. The OAuth token works on /mcp, as this user.
	const client = new Client({ name: 'e2e-oauth', version: '1' });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(`${APP}/mcp`), {
			requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } }
		})
	);
	const created = (await client.callTool({
		name: 'create_comic',
		arguments: { title: 'Via OAuth' }
	})) as {
		content: { text: string }[];
	};
	expect(JSON.parse(created.content[0].text).id).toMatch(/^[0-9a-f-]{36}$/);
	const list = (await client.callTool({ name: 'list_comics', arguments: {} })) as {
		content: { text: string }[];
	};
	expect(JSON.parse(list.content[0].text).map((c: { title: string }) => c.title)).toEqual([
		'Via OAuth'
	]);
});

test('denying consent sends the client an access_denied error', async ({ page, request }) => {
	const user = await createUser('deny');
	const as = await (
		await request.get('http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server')
	).json();
	const reg = await (
		await request.post(as.registration_endpoint, {
			data: {
				client_name: 'Denied client',
				redirect_uris: [CALLBACK],
				token_endpoint_auth_method: 'none'
			}
		})
	).json();
	const authorize = new URL(as.authorization_endpoint);
	authorize.search = new URLSearchParams({
		response_type: 'code',
		client_id: reg.client_id,
		redirect_uri: CALLBACK,
		code_challenge: b64url(createHash('sha256').update('v'.repeat(43)).digest()),
		code_challenge_method: 'S256',
		state: 's'
	}).toString();
	await page.route(`${CALLBACK}**`, (route) =>
		route.fulfill({ status: 200, body: 'callback reached' })
	);
	await openConsent(page, request, authorize);
	await page.locator('body[data-hydrated]').waitFor();
	await page.getByLabel('Email').fill(user.email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.getByRole('button', { name: 'Deny' }).click();
	await page.waitForURL(`${CALLBACK}**`);
	expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied');
});

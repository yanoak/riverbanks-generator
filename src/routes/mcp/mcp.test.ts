import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_SUPABASE_URL: 'https://ref.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk' }
}));

type Handler = (event: { request: Request; url: URL }) => Promise<Response> | Response;
let mcp: { POST: Handler; OPTIONS: Handler };
let metadata: { GET: Handler };

// Importing the route loads the whole server (MCP SDK, providers, Anthropic SDK): slow when the
// suite runs in parallel.
beforeAll(async () => {
	mcp = (await import('./+server')) as unknown as typeof mcp;
	metadata =
		(await import('../.well-known/oauth-protected-resource/mcp/+server')) as unknown as typeof metadata;
}, 60_000);

const event = (path: string, init?: RequestInit) => {
	const url = new URL(`https://app.test${path}`);
	return { request: new Request(url, init), url };
};

describe('/mcp', () => {
	it('challenges a request without a token', async () => {
		const res = await mcp.POST(event('/mcp', { method: 'POST', body: '{}' }));
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toBe(
			'Bearer resource_metadata="https://app.test/.well-known/oauth-protected-resource/mcp"'
		);
		expect(res.headers.get('access-control-expose-headers')).toContain('www-authenticate');
	});

	it('rejects a malformed token as invalid_token', async () => {
		const res = await mcp.POST(
			event('/mcp', { method: 'POST', body: '{}', headers: { authorization: 'Bearer not-a-jwt' } })
		);
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
	});

	it('answers CORS preflight', async () => {
		const res = await mcp.OPTIONS(event('/mcp', { method: 'OPTIONS' }));
		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
	});
});

describe('/.well-known/oauth-protected-resource/mcp', () => {
	it('names Supabase Auth as the authorization server', async () => {
		const res = await metadata.GET(event('/.well-known/oauth-protected-resource/mcp'));
		expect(await res.json()).toMatchObject({
			resource: 'https://app.test/mcp',
			authorization_servers: ['https://ref.supabase.co/auth/v1']
		});
	});
});

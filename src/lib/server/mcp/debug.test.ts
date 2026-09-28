import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { MCP_DEBUG_CLAIMS: '1' } }));

const { safeClaims, logMcpRequest } = await import('./debug');

// header.payload.signature — only the payload matters for decodeJwt
const fake = (claims: Record<string, unknown>) =>
	`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

describe('mcp debug logging', () => {
	it('keeps only safe claims, shortens the user id, and never includes the token', () => {
		const token = fake({
			sub: 'abcdef12-3456',
			aud: 'authenticated',
			client_id: 'c1',
			email: 'x@y.z',
			session_id: 's'
		});
		const out = safeClaims(token)!;
		expect(out).toMatchObject({ aud: 'authenticated', client_id: 'c1', sub: 'abcdef12…' });
		expect(out).not.toHaveProperty('email');
		expect(out).not.toHaveProperty('session_id');
		expect(JSON.stringify(out)).not.toContain(token);
	});

	it('logs the JSON-RPC method without consuming the request body', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const req = new Request('https://a.test/mcp', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
		});
		await logMcpRequest(req, null, 'no-token');
		expect(log.mock.calls[0][1]).toContain('"rpc":"tools/list"');
		expect(await req.json()).toMatchObject({ method: 'tools/list' });
		log.mockRestore();
	});
});

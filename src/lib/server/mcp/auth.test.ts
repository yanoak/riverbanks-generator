import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { bearerToken, protectedResourceMetadata, unauthorized, verifyAccessToken } from './auth';

const SUPABASE = 'https://ref.supabase.co';

async function keys() {
	const { publicKey, privateKey } = await generateKeyPair('ES256');
	const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
	const jwks = createLocalJWKSet({ keys: [jwk] });
	const sign = (claims: Record<string, unknown>, opts: { issuer?: string; exp?: string } = {}) =>
		new SignJWT(claims)
			.setProtectedHeader({ alg: 'ES256', kid: 'k1' })
			.setIssuer(opts.issuer ?? `${SUPABASE}/auth/v1`)
			.setIssuedAt()
			.setExpirationTime(opts.exp ?? '1h')
			.sign(privateKey);
	return { jwks, sign };
}

describe('bearerToken', () => {
	it('reads a Bearer header, case-insensitively', () => {
		const req = (h?: string) =>
			new Request('https://a.test/mcp', { headers: h ? { authorization: h } : {} });
		expect(bearerToken(req('Bearer abc'))).toBe('abc');
		expect(bearerToken(req('bearer abc'))).toBe('abc');
		expect(bearerToken(req('Basic abc'))).toBeNull();
		expect(bearerToken(req())).toBeNull();
	});
});

describe('verifyAccessToken', () => {
	it('accepts a Supabase user token and returns the user, client and scopes', async () => {
		const { jwks, sign } = await keys();
		const token = await sign({
			sub: 'user-1',
			role: 'authenticated',
			client_id: 'claude',
			scope: 'openid email'
		});
		expect(await verifyAccessToken(token, SUPABASE, jwks)).toMatchObject({
			userId: 'user-1',
			clientId: 'claude',
			scopes: ['openid', 'email']
		});
	});

	it('rejects the wrong issuer, expired tokens and non-user roles', async () => {
		const { jwks, sign } = await keys();
		await expect(
			verifyAccessToken(
				await sign({ sub: 'u', role: 'authenticated' }, { issuer: 'https://evil.test' }),
				SUPABASE,
				jwks
			)
		).rejects.toThrow();
		await expect(
			verifyAccessToken(
				await sign({ sub: 'u', role: 'authenticated' }, { exp: '-1m' }),
				SUPABASE,
				jwks
			)
		).rejects.toThrow();
		await expect(
			verifyAccessToken(await sign({ sub: 'u', role: 'anon' }), SUPABASE, jwks)
		).rejects.toThrow(/user token/);
	});
});

describe('unauthorized', () => {
	it('points MCP clients at the protected-resource metadata', async () => {
		const res = unauthorized('https://app.test');
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toBe(
			'Bearer resource_metadata="https://app.test/.well-known/oauth-protected-resource/mcp"'
		);
		const bad = unauthorized('https://app.test', 'invalid_token');
		expect(bad.headers.get('www-authenticate')).toContain('error="invalid_token"');
	});
});

describe('protectedResourceMetadata', () => {
	it('names the MCP endpoint and Supabase Auth as its authorization server', () => {
		expect(protectedResourceMetadata('https://app.test', SUPABASE)).toMatchObject({
			resource: 'https://app.test/mcp',
			authorization_servers: [`${SUPABASE}/auth/v1`],
			bearer_methods_supported: ['header']
		});
	});
});

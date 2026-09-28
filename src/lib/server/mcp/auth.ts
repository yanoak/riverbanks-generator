// OAuth for the MCP endpoint. Supabase Auth is the authorization server (its OAuth 2.1 server
// handles client registration, sign-in and tokens); this app is the protected resource: it
// advertises that in metadata, challenges unauthenticated requests, and verifies access tokens
// against the project's JWKS (asymmetric signing keys).

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const jwksCache = new Map<string, JWTVerifyGetKey>();

function remoteJwks(supabaseUrl: string): JWTVerifyGetKey {
	let jwks = jwksCache.get(supabaseUrl);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
		jwksCache.set(supabaseUrl, jwks);
	}
	return jwks;
}

export function bearerToken(request: Request): string | null {
	const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
	return match ? match[1].trim() : null;
}

export interface VerifiedUser {
	userId: string;
	clientId?: string;
	scopes: string[];
	expiresAt?: number;
}

export async function verifyAccessToken(
	token: string,
	supabaseUrl: string,
	jwks: JWTVerifyGetKey = remoteJwks(supabaseUrl)
): Promise<VerifiedUser> {
	const { payload } = await jwtVerify(token, jwks, { issuer: `${supabaseUrl}/auth/v1` });
	if (payload.role !== 'authenticated' || typeof payload.sub !== 'string') {
		throw new Error('Not a user token.');
	}
	return {
		userId: payload.sub,
		clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
		scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
		expiresAt: payload.exp
	};
}

export const metadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/mcp`;

/** 401 with the RFC 9728 challenge MCP clients use to discover how to sign in. */
export function unauthorized(origin: string, error?: 'invalid_token'): Response {
	const challenge = `Bearer resource_metadata="${metadataUrl(origin)}"${error ? `, error="${error}"` : ''}`;
	return new Response(JSON.stringify({ error: error ?? 'unauthorized' }), {
		status: 401,
		headers: {
			'content-type': 'application/json',
			'www-authenticate': challenge,
			...CORS
		}
	});
}

export function protectedResourceMetadata(origin: string, supabaseUrl: string) {
	return {
		resource: `${origin}/mcp`,
		resource_name: 'Riverbanks',
		authorization_servers: [`${supabaseUrl}/auth/v1`],
		bearer_methods_supported: ['header'],
		scopes_supported: ['openid', 'email', 'profile']
	};
}

/** Browser-based MCP clients (e.g. the MCP Inspector) call cross-origin. */
export const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
	'access-control-allow-headers':
		'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
	'access-control-expose-headers': 'www-authenticate, mcp-session-id'
};

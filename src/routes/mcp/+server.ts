// MCP endpoint (Streamable HTTP, stateless). Every request must carry a Supabase access token
// from the OAuth flow; tools then run as that user, so row-level security applies.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from '$lib/server/supabase-env';
import { bearerToken, CORS, unauthorized, verifyAccessToken } from '$lib/server/mcp/auth';
import { importImage } from '$lib/server/mcp/images';
import { createMcpServer } from '$lib/server/mcp/server';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import type { RequestHandler } from './$types';

const handle: RequestHandler = async ({ request, url }) => {
	const { url: supabaseUrl, key } = supabaseEnv();
	const token = bearerToken(request);
	if (!token) return unauthorized(url.origin);

	let user;
	try {
		user = await verifyAccessToken(token, supabaseUrl);
	} catch {
		return unauthorized(url.origin, 'invalid_token');
	}

	const supabase = createClient(supabaseUrl, key, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const server = createMcpServer({
		store: new SupabaseComicStore(supabase),
		user: { id: user.userId, email: user.email },
		importImage: (source) => importImage(supabase, user.userId, source),
		appUrl: url.origin
	});
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});
	await server.connect(transport);
	const response = await transport.handleRequest(request, {
		authInfo: {
			token,
			clientId: user.clientId,
			scopes: user.scopes,
			expiresAt: user.expiresAt,
			extra: { userId: user.userId }
		}
	});
	for (const [k, v] of Object.entries(CORS)) response.headers.set(k, v);
	return response;
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS: RequestHandler = () => new Response(null, { status: 204, headers: CORS });

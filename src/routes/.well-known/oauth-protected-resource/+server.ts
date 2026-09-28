// RFC 9728 protected-resource metadata: tells MCP clients that Supabase Auth issues tokens
// for this app's /mcp endpoint.

import { json } from '@sveltejs/kit';
import { supabaseEnv } from '$lib/server/supabase-env';
import { CORS, protectedResourceMetadata } from '$lib/server/mcp/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) =>
	json(protectedResourceMetadata(url.origin, supabaseEnv().url), { headers: CORS });

export const OPTIONS: RequestHandler = () => new Response(null, { status: 204, headers: CORS });

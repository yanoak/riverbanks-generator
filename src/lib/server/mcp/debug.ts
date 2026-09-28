// Temporary spike logging for ChatGPT access (plan 2026-09-28_chatgpt-mcp-access): one line per
// /mcp request with transport headers and a SAFE SUBSET of token claims. Never the token itself.
// Enabled only when MCP_DEBUG_CLAIMS=1.

import { decodeJwt } from 'jose';
import { env } from '$env/dynamic/private';

export const debugEnabled = () => env.MCP_DEBUG_CLAIMS === '1';

const SAFE_CLAIMS = ['iss', 'aud', 'client_id', 'scope', 'role', 'aal', 'exp', 'iat'] as const;

export function safeClaims(token: string | null): Record<string, unknown> | null {
	if (!token) return null;
	try {
		const payload = decodeJwt(token);
		const out: Record<string, unknown> = Object.fromEntries(
			SAFE_CLAIMS.filter((k) => k in payload).map((k) => [k, payload[k]])
		);
		if (typeof payload.sub === 'string') out.sub = `${payload.sub.slice(0, 8)}…`;
		out.claimNames = Object.keys(payload).sort();
		return out;
	} catch {
		return { undecodable: true };
	}
}

export async function logMcpRequest(
	request: Request,
	token: string | null,
	outcome: string
): Promise<void> {
	if (!debugEnabled()) return;
	let rpc: unknown = null;
	if (request.method === 'POST') {
		try {
			const body = await request.clone().json();
			rpc = Array.isArray(body) ? body.map((m) => m?.method) : body?.method;
		} catch {
			rpc = 'unparseable';
		}
	}
	const h = request.headers;
	console.log(
		'[mcp-debug]',
		JSON.stringify({
			outcome,
			method: request.method,
			rpc,
			accept: h.get('accept'),
			contentType: h.get('content-type'),
			protocolVersion: h.get('mcp-protocol-version'),
			session: h.has('mcp-session-id'),
			userAgent: h.get('user-agent'),
			claims: safeClaims(token)
		})
	);
}

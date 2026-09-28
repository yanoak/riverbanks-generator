import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** The browser's client; shares the cookie session set by the server. */
export function supabaseBrowser(url: string, key: string): SupabaseClient {
	client ??= createBrowserClient(url, key);
	return client;
}

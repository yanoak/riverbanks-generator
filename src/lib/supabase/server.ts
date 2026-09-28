import { createServerClient } from '@supabase/ssr';
import type { Cookies } from '@sveltejs/kit';
import { supabaseEnv } from '$lib/server/supabase-env';

/** Per-request client whose session lives in cookies (ported from canvas-tool-template). */
export function createSupabaseServerClient(cookies: Cookies) {
	const { url, key } = supabaseEnv();
	return createServerClient(url, key, {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (toSet) => {
				for (const { name, value, options } of toSet)
					cookies.set(name, value, { ...options, path: '/' });
			}
		}
	});
}

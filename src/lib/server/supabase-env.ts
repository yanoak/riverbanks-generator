import { env } from '$env/dynamic/public';

/** The Supabase project URL and publishable key, or a clear error when they are not set. */
export function supabaseEnv(): { url: string; key: string } {
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!url || !key) {
		throw new Error(
			'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (see .env.example).'
		);
	}
	return { url, key };
}

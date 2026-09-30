// Provider keys (server-only). A missing key hides that provider rather than erroring.
// GENERATION_PROVIDER=fake swaps every provider for a free stand-in (tests, e2e, offline dev).
import { env } from '$env/dynamic/private';

export const useFake = () => env.GENERATION_PROVIDER === 'fake';
export const geminiKey = () => env.GEMINI_API_KEY || undefined;

export const NO_GEMINI =
	'Gemini isn’t set up on this server: add GEMINI_API_KEY to the environment.';

/** Higgsfield credentials: HF_API_KEY + HF_API_SECRET, or HF_CREDENTIALS="id:secret". */
export function higgsfieldCredentials(): { keyId: string; secret: string } | undefined {
	const [keyId, secret] = env.HF_CREDENTIALS?.split(':') ?? [env.HF_API_KEY, env.HF_API_SECRET];
	return keyId && secret ? { keyId, secret } : undefined;
}

import { defineConfig } from '@playwright/test';
import { execSync } from 'node:child_process';

/** Point the preview server at the local Supabase stack (`supabase start`). */
function localSupabase(): Record<string, string> {
	try {
		const out = execSync('supabase status -o env', {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
		const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, 'm'))?.[1] ?? '';
		return {
			PUBLIC_SUPABASE_URL: get('API_URL'),
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: get('PUBLISHABLE_KEY'),
			SUPABASE_TEST_SECRET_KEY: get('SECRET_KEY')
		};
	} catch {
		throw new Error('E2E tests need the local Supabase stack: run `supabase start` first.');
	}
}

const env = localSupabase();
Object.assign(process.env, env);

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview -- --port 4318 --strictPort',
		port: 4318,
		env: {
			PUBLIC_SUPABASE_URL: env.PUBLIC_SUPABASE_URL,
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
			// Never spend money in tests: every image and describe call gets a stand-in.
			GENERATION_PROVIDER: 'fake'
		}
	},
	use: { baseURL: 'http://localhost:4318' },
	testMatch: '**/*.e2e.{ts,js}'
});

// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			getUser: () => Promise<{ id: string; email: string } | null>;
		}
		interface PageData {
			user?: { id: string; email: string } | null;
		}
	}
}

export {};

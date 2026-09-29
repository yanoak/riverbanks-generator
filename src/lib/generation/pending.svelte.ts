// Generations in flight or failed, by panel id. Module state, so selecting another panel (which
// remounts the Inspector's Generate block) neither loses a result nor its error.
import { SvelteMap } from 'svelte/reactivity';

export interface Pending {
	started: number;
	error?: string;
}

export const pending = new SvelteMap<string, Pending>();

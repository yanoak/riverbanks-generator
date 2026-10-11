// A My comics thumbnail is named by what it shows (plans/2026-10-11_comic-thumbnails.plan.md):
// the same key is computed on the server, from the stored JSON, and in the editor, from the live
// comic, so the list knows which file to ask for without a table.
import type { Bands, Page } from '$lib/model/types';
import type { Typography } from '$lib/typography/typography';

/** Bump when rendering code changes how a page looks, so every thumbnail is redrawn. */
const VERSION = 1;

export interface ThumbInput {
	page: Page;
	/** Page 1's header and footer, resolved (bandsFor). */
	bands: Bands;
	typography: Typography;
}

/** JSON with keys sorted at every depth and undefined dropped, as jsonb would round-trip it. */
export function stableJson(value: unknown): string {
	return JSON.stringify(value, (_key, v: unknown) =>
		v && typeof v === 'object' && !Array.isArray(v)
			? Object.fromEntries(
					Object.entries(v)
						.filter(([, x]) => x !== undefined)
						.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				)
			: v
	);
}

export async function thumbKey({ page, bands, typography }: ThumbInput): Promise<string> {
	const text = stableJson({ v: VERSION, page, bands, typography });
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest).slice(0, 8)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

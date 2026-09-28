import type { Comic } from '$lib/model/types';

/** The local (signed-out) comic's storage. Cloud comics sync through CloudDoc instead. */
export interface DocumentSource {
	/** The document to open; null starts a fresh comic. */
	load(): Promise<Comic | null>;
	save(comic: Comic): Promise<void>;
}

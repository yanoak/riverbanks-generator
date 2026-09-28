import type { Comic } from '$lib/model/types';

/** Where the editor's document lives: the browser (local) or Supabase (signed in). */
export interface DocumentSource {
	/** The document to open; null starts a fresh comic. */
	load(): Promise<Comic | null>;
	/** Persist; throws ConflictError (see autosave.ts) when someone else wrote first. */
	save(comic: Comic): Promise<void>;
	/** The newest stored copy, after a conflict. */
	reload?(): Promise<Comic>;
	/** Write ours over whatever is stored. */
	overwrite?(comic: Comic): Promise<void>;
	/** Be told about newer copies written elsewhere (e.g. by the MCP server). */
	watch?(onRemote: (comic: Comic) => void): () => void;
}

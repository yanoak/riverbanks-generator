import { deserialize, serialize } from '$lib/model/serialize';
import type { Comic } from '$lib/model/types';
import { loadDocument, saveDocument } from './documents';
import type { DocumentSource } from './source';

/** The single browser-only comic of /local (v1's IndexedDB store). */
export const localSource: DocumentSource = {
	async load(): Promise<Comic | null> {
		const json = await loadDocument();
		return json ? deserialize(json) : null;
	},
	async save(comic: Comic): Promise<void> {
		await saveDocument(serialize(comic));
	}
};

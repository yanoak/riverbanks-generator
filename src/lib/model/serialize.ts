import { DOC_VERSION, type Comic } from './types';

/**
 * Upgrade steps, keyed by the version they upgrade *from*. When the document shape changes,
 * bump DOC_VERSION and add a step here — stored comics are migrated on load.
 */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

export function serialize(comic: Comic): string {
	return JSON.stringify(comic);
}

export function migrate(raw: unknown): Comic {
	if (!raw || typeof raw !== 'object' || !('pages' in raw) || !('docVersion' in raw)) {
		throw new Error('This file is not a comic document.');
	}
	let doc = raw as Record<string, unknown>;
	let version = doc.docVersion as number;
	if (version > DOC_VERSION) {
		throw new Error(`This comic was saved by a newer version (v${version}) of the app.`);
	}
	while (version < DOC_VERSION) {
		doc = { ...MIGRATIONS[version](doc), docVersion: ++version };
	}
	return doc as unknown as Comic;
}

export function deserialize(json: string): Comic {
	return migrate(JSON.parse(json));
}

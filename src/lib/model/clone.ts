/**
 * Deep copy of document data. The document is plain JSON by construction, and unlike
 * structuredClone this also copies Svelte $state proxies (which structuredClone rejects).
 */
export function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

// The comic document in IndexedDB. v1 keeps a single comic under one key; swapping this
// module for a server-backed one is the path to accounts and sync.

import { browser } from '$app/environment';
import { createStore, get, set } from 'idb-keyval';

const store = browser ? createStore('riverbanks-docs', 'docs') : undefined;
const KEY = 'current';

export async function loadDocument(): Promise<string | undefined> {
	return get<string>(KEY, store);
}

export async function saveDocument(json: string): Promise<void> {
	await set(KEY, json, store);
}

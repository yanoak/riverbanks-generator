// Integration: runs against the local stack (`supabase start`), via `npm run test:int`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { clone } from '$lib/model/clone';
import { createComic } from '$lib/model/factory';
import { applyComic, projectComic } from '$lib/model/ydoc';
import { initialState, openDoc } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from './supabase-store';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_TEST_SECRET_KEY;

async function userClient(admin: SupabaseClient, label: string) {
	const email = `${label}-${crypto.randomUUID()}@test.local`;
	const password = 'correct horse battery';
	const { data, error } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (error) throw error;
	const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
	const { data: s, error: e } = await client.auth.signInWithPassword({ email, password });
	if (e) throw e;
	return { client, id: data.user.id, token: s.session!.access_token };
}

describe.skipIf(!url || !serviceKey)('SupabaseComicStore against local Supabase', () => {
	let a: Awaited<ReturnType<typeof userClient>>;
	let b: Awaited<ReturnType<typeof userClient>>;

	beforeAll(async () => {
		const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
		[a, b] = await Promise.all([userClient(admin, 'a'), userClient(admin, 'b')]);
	});

	const create = (store: SupabaseComicStore, title: string) => {
		const comic = createComic(title);
		return store.create(title, comic, initialState(comic));
	};

	it('creates with a snapshot, appends updates, and compacts compare-and-set', async () => {
		const store = new SupabaseComicStore(a.client);
		const rec = await create(store, 'Integration');
		const opened = (await openDoc(store, rec.id))!;
		expect(opened.snapshotRev).toBe(1);

		const before = projectComic(opened.doc);
		const after = clone(before);
		after.title = 'Renamed';
		const base = Y.encodeStateVector(opened.doc);
		applyComic(opened.doc, before, after);
		const id = await store.append(rec.id, Y.encodeStateAsUpdate(opened.doc, base));
		opened.applied.add(id);
		expect((await store.state(rec.id))?.updates.map((u) => u.id)).toEqual([id]);

		// A stale base loses; the right one folds the update and refreshes the projection.
		const c = {
			state: Y.encodeStateAsUpdate(opened.doc),
			applied: [id],
			title: 'Renamed',
			projection: projectComic(opened.doc)
		};
		expect(await store.compact(rec.id, { ...c, baseRev: 0 })).toBe(false);
		expect(await store.compact(rec.id, { ...c, baseRev: 1 })).toBe(true);
		const s = (await store.state(rec.id))!;
		expect([s.snapshotRev, s.upto, s.updates.length]).toEqual([2, id, 0]);
		expect((await store.get(rec.id))?.title).toBe('Renamed');
		expect(projectComic((await openDoc(store, rec.id))!.doc).title).toBe('Renamed');
	});

	it('converts a pre-Yjs comic on first open, once', async () => {
		const comic = createComic('Legacy');
		const { data } = await a.client
			.from('comics')
			.insert({ title: 'Legacy', doc: comic })
			.select('id')
			.single();
		const store = new SupabaseComicStore(a.client);
		const [x, y] = await Promise.all([openDoc(store, data!.id), openDoc(store, data!.id)]);
		expect(projectComic(x!.doc).pages[0].panels.map((p) => p.id)).toEqual(
			comic.pages[0].panels.map((p) => p.id)
		);
		expect(Y.encodeStateVector(y!.doc)).toEqual(Y.encodeStateVector(x!.doc));
	});

	it('keeps other users out (RLS)', async () => {
		const rec = await create(new SupabaseComicStore(a.client), 'Private');
		const theirs = new SupabaseComicStore(b.client);
		expect(await theirs.get(rec.id)).toBeNull();
		expect(await theirs.state(rec.id)).toBeNull();
		expect((await theirs.list()).map((c) => c.id)).not.toContain(rec.id);
		await expect(theirs.append(rec.id, new Uint8Array([0, 0]))).rejects.toThrow();
		expect(
			await theirs.compact(rec.id, {
				baseRev: 1,
				state: new Uint8Array([0, 0]),
				applied: [],
				title: 'x',
				projection: createComic('x')
			})
		).toBe(false);
		expect(await theirs.initSnapshot(rec.id, new Uint8Array([0, 0]))).toBe(false);
		expect(await theirs.delete(rec.id)).toBe(false);
		// records() feeds the MCP search tool: RLS keeps other people's comics out of it too.
		expect((await theirs.records()).map((r) => r.id)).not.toContain(rec.id);
		expect((await new SupabaseComicStore(a.client).records()).map((r) => r.id)).toContain(rec.id);
	});

	it('confines storage to the user’s own folder', async () => {
		const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
		const own = await a.client.storage.from('assets').upload(`${a.id}/one`, png);
		expect(own.error).toBeNull();
		const other = await a.client.storage.from('assets').upload(`${b.id}/sneaky`, png);
		expect(other.error).not.toBeNull();
		const read = await b.client.storage.from('assets').download(`${a.id}/one`);
		expect(read.error).not.toBeNull();
	});

	it('signs session tokens the JWKS verifies, but /mcp refuses them (no OAuth client_id)', async () => {
		const { verifyAccessToken } = await import('$lib/server/mcp/auth');
		// Signature and issuer pass (a real ES256 token); the fallback rule then rejects it.
		await expect(verifyAccessToken(a.token, url!)).rejects.toThrow(/OAuth/);
	});
});

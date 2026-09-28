// Integration: runs against the local stack (`supabase start`), via `npm run test:int`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
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

	it('creates, reads and saves with the rev guard', async () => {
		const store = new SupabaseComicStore(a.client);
		const comic = createComic('Integration');
		const rec = await store.create('Integration', comic);
		expect(rec.rev).toBe(1);

		comic.title = 'Renamed';
		expect(await store.update(rec.id, comic, 'Renamed', 1)).toEqual({ ok: true, rev: 2 });
		expect(await store.update(rec.id, comic, 'Stale', 1)).toEqual({
			ok: false,
			reason: 'conflict'
		});
		expect((await store.get(rec.id))?.title).toBe('Renamed');
		expect((await store.list()).find((c) => c.id === rec.id)).toMatchObject({ pages: 1, rev: 2 });
	});

	it('keeps other users out (RLS)', async () => {
		const rec = await new SupabaseComicStore(a.client).create('Private', createComic('Private'));
		const theirs = new SupabaseComicStore(b.client);
		expect(await theirs.get(rec.id)).toBeNull();
		expect((await theirs.list()).map((c) => c.id)).not.toContain(rec.id);
		expect(await theirs.update(rec.id, createComic('x'), 'x', 1)).toEqual({
			ok: false,
			reason: 'not-found'
		});
		expect(await theirs.delete(rec.id)).toBe(false);
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

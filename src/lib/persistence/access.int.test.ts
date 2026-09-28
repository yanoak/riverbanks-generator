// Integration: sharing and access rules against the local stack, via `npm run test:int`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createComic } from '$lib/model/factory';
import { initialState, openDoc } from '$lib/ops/ydoc-store';
import { invite, listPeople, removePerson } from './sharing';
import { SupabaseComicStore } from './supabase-store';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_TEST_SECRET_KEY;

async function account(admin: SupabaseClient, label: string) {
	const email = `${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
	const password = 'correct horse battery';
	const { data, error } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (error) throw error;
	const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
	const { error: e } = await client.auth.signInWithPassword({ email, password });
	if (e) throw e;
	return { client, id: data.user.id, email, store: new SupabaseComicStore(client) };
}

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

describe.skipIf(!url || !serviceKey)('sharing and access (RLS)', () => {
	let owner: Awaited<ReturnType<typeof account>>;
	let editor: Awaited<ReturnType<typeof account>>;
	let outsider: Awaited<ReturnType<typeof account>>;
	let comicId: string;

	beforeAll(async () => {
		const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
		[owner, editor, outsider] = await Promise.all([
			account(admin, 'owner'),
			account(admin, 'editor'),
			account(admin, 'outsider')
		]);
		const comic = createComic('Shared');
		comicId = (await owner.store.create('Shared', comic, initialState(comic))).id;
	});

	it('the creator is the owner member', async () => {
		expect(await listPeople(owner.client, comicId)).toEqual([
			{ userId: owner.id, email: owner.email, role: 'owner' }
		]);
	});

	it('refuses an unknown email with a clear message, and only the owner may invite', async () => {
		await expect(invite(owner.client, comicId, 'nobody@test.local')).rejects.toThrow(
			'No Riverbanks account with that email.'
		);
		await expect(invite(outsider.client, comicId, outsider.email)).rejects.toThrow(/owner/);
	});

	it('an invited editor can open, edit and compact; the list shows them', async () => {
		const added = await invite(owner.client, comicId, editor.email.toUpperCase());
		expect(added).toEqual({ userId: editor.id, email: editor.email, role: 'editor' });
		// Inviting again, or the owner themselves, changes nothing.
		await invite(owner.client, comicId, editor.email);
		await invite(owner.client, comicId, owner.email);
		expect((await listPeople(editor.client, comicId)).map((p) => p.role)).toEqual([
			'owner',
			'editor'
		]);

		const opened = (await openDoc(editor.store, comicId))!;
		const base = Y.encodeStateVector(opened.doc);
		opened.doc.getMap('comic').set('title', 'Edited by the editor');
		const id = await editor.store.append(comicId, Y.encodeStateAsUpdate(opened.doc, base));
		expect(id).toBeGreaterThan(0);
		expect((await editor.store.list()).map((c) => c.id)).toContain(comicId);
	});

	it('an outsider sees nothing and can change nothing', async () => {
		expect(await outsider.store.get(comicId)).toBeNull();
		expect(await outsider.store.state(comicId)).toBeNull();
		await expect(outsider.store.append(comicId, new Uint8Array([0, 0]))).rejects.toMatchObject({
			code: '42501'
		});
		await expect(listPeople(outsider.client, comicId)).resolves.toEqual([]);
	});

	it('comic images: members read and upload in the comic folder; outsiders cannot', async () => {
		const up = await editor.client.storage.from('assets').upload(`${comicId}/img-1`, png());
		expect(up.error).toBeNull();
		const read = await owner.client.storage.from('assets').download(`${comicId}/img-1`);
		expect(read.error).toBeNull();
		const peek = await outsider.client.storage.from('assets').download(`${comicId}/img-1`);
		expect(peek.error).not.toBeNull();
		const sneak = await outsider.client.storage.from('assets').upload(`${comicId}/x`, png());
		expect(sneak.error).not.toBeNull();
	});

	it('the owner copies a pre-sharing image from their own folder into the comic', async () => {
		await owner.client.storage.from('assets').upload(`${owner.id}/old-1`, png());
		const { error } = await owner.client.storage
			.from('assets')
			.copy(`${owner.id}/old-1`, `${comicId}/old-1`);
		expect(error).toBeNull();
		const read = await editor.client.storage.from('assets').download(`${comicId}/old-1`);
		expect(read.error).toBeNull();
	});

	it('an editor cannot delete the comic or remove others, but can leave', async () => {
		expect(await editor.store.delete(comicId)).toBe(false);
		await expect(removePerson(editor.client, comicId, owner.id)).rejects.toThrow(/owner/);
		await removePerson(editor.client, comicId, editor.id);
		expect(await editor.store.state(comicId)).toBeNull();
		await expect(editor.store.append(comicId, new Uint8Array([0, 0]))).rejects.toMatchObject({
			code: '42501'
		});
	});

	it('the owner removes an editor; the owner cannot be removed', async () => {
		await invite(owner.client, comicId, editor.email);
		await removePerson(owner.client, comicId, editor.id);
		expect(await editor.store.get(comicId)).toBeNull();
		await removePerson(owner.client, comicId, owner.id); // a no-op, not an error
		expect((await listPeople(owner.client, comicId)).map((p) => p.userId)).toEqual([owner.id]);
		expect(await owner.store.delete(comicId)).toBe(true);
	});
});

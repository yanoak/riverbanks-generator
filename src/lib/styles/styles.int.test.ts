// Integration: style profiles and generations RLS against the local stack, via `npm run test:int`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import { initialState } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import {
	addCastMember,
	addRef,
	createProfile,
	deleteProfile,
	getProfile,
	listProfiles,
	removeCastMember,
	removeRef,
	saveProfile,
	updateCastMember,
	updateRef
} from './styles';

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
	return { client, id: data.user.id, email };
}

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

describe.skipIf(!url || !serviceKey)('style profiles and generations (RLS)', () => {
	let maker: Awaited<ReturnType<typeof account>>;
	let other: Awaited<ReturnType<typeof account>>;
	let profileId: string;

	beforeAll(async () => {
		const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
		[maker, other] = await Promise.all([account(admin, 'maker'), account(admin, 'other')]);
		profileId = await createProfile(maker.client, 'Tidewater ink');
	});

	it('the creator saves fields; everyone reads them, with the creator’s email', async () => {
		await saveProfile(maker.client, profileId, {
			style: 'Loose brush ink',
			palette: [{ hex: '#1d3557', name: 'deep navy' }],
			avoid: 'gradients',
			model: 'gemini-flash'
		});
		const seen = await getProfile(other.client, profileId);
		expect(seen).toMatchObject({
			name: 'Tidewater ink',
			style: 'Loose brush ink',
			palette: [{ hex: '#1d3557', name: 'deep navy' }],
			avoid: 'gradients',
			model: 'gemini-flash',
			createdBy: maker.id,
			creatorEmail: maker.email,
			refs: []
		});
		expect((await listProfiles(other.client)).map((p) => p.id)).toContain(profileId);
	});

	it('someone else cannot change or delete it', async () => {
		await expect(saveProfile(other.client, profileId, { name: 'Mine now' })).rejects.toThrow();
		expect(await deleteProfile(other.client, profileId)).toBe(false);
		expect((await getProfile(maker.client, profileId))?.name).toBe('Tidewater ink');
	});

	it('the creator adds, labels and removes references; others read but cannot add', async () => {
		const ref = await addRef(maker.client, profileId, png(), { width: 4, height: 3 });
		expect(ref).toMatchObject({ role: 'style', label: '', sort: 0, width: 4, height: 3 });
		const second = await addRef(maker.client, profileId, png(), { width: 1, height: 1 });
		expect(second.sort).toBe(1);
		await updateRef(maker.client, ref.id, { role: 'character', label: 'Mae' });

		const seen = (await getProfile(other.client, profileId))!;
		expect(seen.refs.map((r) => [r.role, r.label])).toEqual([
			['character', 'Mae'],
			['style', '']
		]);
		const read = await other.client.storage.from('style-refs').download(`${profileId}/${ref.id}`);
		expect(read.error).toBeNull();

		await expect(addRef(other.client, profileId, png(), { width: 1, height: 1 })).rejects.toThrow();
		const sneak = await other.client.storage.from('style-refs').upload(`${profileId}/x`, png());
		expect(sneak.error).not.toBeNull();

		await removeRef(maker.client, second);
		expect((await getProfile(maker.client, profileId))!.refs).toHaveLength(1);
	});

	it('the creator builds a cast with portraits; others read it but cannot change it', async () => {
		const mae = await addCastMember(maker.client, profileId, {
			kind: 'character',
			name: 'Mae',
			aliases: ['the girl'],
			description: 'Twelve, red scarf'
		});
		const raft = await addCastMember(maker.client, profileId, { kind: 'object', name: 'the raft' });
		expect(raft.sort).toBe(mae.sort + 1);
		const portrait = await addRef(
			maker.client,
			profileId,
			png(),
			{ width: 3, height: 2 },
			'character',
			mae.id
		);
		expect(portrait.castId).toBe(mae.id);
		await updateCastMember(maker.client, mae, { portraitId: portrait.id, aliases: ['Mae', 'kid'] });

		const seen = (await getProfile(other.client, profileId))!;
		expect(seen.cast.map((m) => [m.name, m.kind, m.aliases])).toEqual([
			['Mae', 'character', ['Mae', 'kid']],
			['the raft', 'object', []]
		]);
		expect(seen.cast[0].portraitId).toBe(portrait.id);
		expect(seen.refs.find((r) => r.id === portrait.id)?.castId).toBe(mae.id);

		await expect(addCastMember(other.client, profileId, { name: 'Intruder' })).rejects.toThrow();
		await expect(updateCastMember(other.client, mae, { name: 'Mine' })).rejects.toThrow();

		// A kind change carries over to the portraits' reference role.
		await updateCastMember(maker.client, raft, { kind: 'place' });
		// Removing a member removes its portraits and their files.
		await removeCastMember(maker.client, mae);
		const after = (await getProfile(maker.client, profileId))!;
		expect(after.cast.map((m) => [m.name, m.kind])).toEqual([['the raft', 'place']]);
		expect(after.refs.some((r) => r.id === portrait.id)).toBe(false);
		const gone = await maker.client.storage
			.from('style-refs')
			.download(`${profileId}/${portrait.id}`);
		expect(gone.error).not.toBeNull();
	});

	it('generations: members log and read them; outsiders cannot', async () => {
		const comic = createComic('Gen');
		const comicId = (
			await new SupabaseComicStore(maker.client).create('Gen', comic, initialState(comic))
		).id;
		const row = {
			comic_id: comicId,
			panel_id: comic.pages[0].panels[0].id,
			model: 'fake',
			prompt: 'a raft',
			full_prompt: 'a raft',
			aspect: '1:1'
		};
		const ok = await maker.client.from('generations').insert(row).select('id, status').single();
		expect(ok.error).toBeNull();
		expect(ok.data?.status).toBe('running');

		const sneak = await other.client.from('generations').insert(row);
		expect(sneak.error).not.toBeNull();
		const peek = await other.client.from('generations').select('id').eq('comic_id', comicId);
		expect(peek.data).toEqual([]);
	});

	it('the creator deletes the profile, its references and their files', async () => {
		const ref = (await getProfile(maker.client, profileId))!.refs[0];
		expect(await deleteProfile(maker.client, profileId)).toBe(true);
		expect(await getProfile(maker.client, profileId)).toBeNull();
		const gone = await maker.client.storage.from('style-refs').download(`${profileId}/${ref.id}`);
		expect(gone.error).not.toBeNull();
	});
});

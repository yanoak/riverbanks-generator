// Integration: generating a panel image against the local stack, with the fake provider.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import { initialState } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import { addRef, createProfile, saveProfile, updateRef } from '$lib/styles/styles';
import { fakeProvider, solidPng } from './fake';
import { generatePanelImage } from './generate';
import type { GenerateRequest, ImageProvider } from './provider';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_TEST_SECRET_KEY;

async function account(admin: SupabaseClient, label: string) {
	const email = `${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
	const password = 'correct horse battery';
	const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (error) throw error;
	const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
	const { error: e } = await client.auth.signInWithPassword({ email, password });
	if (e) throw e;
	return client;
}

/** The fake provider, recording what it was asked. */
function recording() {
	const calls: GenerateRequest[] = [];
	const provider: ImageProvider = {
		generate: (req) => (calls.push(req), fakeProvider().generate(req))
	};
	return { calls, provider: () => provider };
}

describe.skipIf(!url || !serviceKey)('generatePanelImage', () => {
	let member: SupabaseClient;
	let outsider: SupabaseClient;
	let comicId: string;
	let panelId: string;
	let profileId: string;

	beforeAll(async () => {
		const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
		[member, outsider] = await Promise.all([account(admin, 'gen'), account(admin, 'nosy')]);
		const comic = createComic('Gen');
		panelId = comic.pages[0].panels[0].id;
		comicId = (await new SupabaseComicStore(member).create('Gen', comic, initialState(comic))).id;

		profileId = await createProfile(member, 'Ink');
		await saveProfile(member, profileId, { style: 'Loose ink', avoid: 'gradients' });
		const png = new Blob([solidPng(4, 4, [10, 20, 30]) as BlobPart], { type: 'image/png' });
		await addRef(member, profileId, png, { width: 4, height: 4 });
		const mae = await addRef(member, profileId, png, { width: 4, height: 4 });
		await updateRef(member, mae.id, { role: 'character', label: 'Mae' });
	});

	it('generates with the style, stores the image, and logs a done take', async () => {
		const { calls, provider } = recording();
		const out = await generatePanelImage(
			member,
			{
				comicId,
				panelId,
				prompt: 'Mae on the raft',
				profileId,
				modelKey: 'gemini-flash',
				box: { w: 900, h: 300 }
			},
			{ provider }
		);
		expect(out).toMatchObject({ aspect: '21:9', model: 'gemini-flash', dropped: 0 });
		expect(out.naturalWidth / out.naturalHeight).toBeCloseTo(21 / 9, 1);

		expect(calls[0].refs).toHaveLength(2);
		expect(calls[0].prompt).toContain('Style: Loose ink.');
		expect(calls[0].prompt).toContain('- Image 2: the character “Mae”.');
		expect(calls[0].prompt).toMatch(/Panel: Mae on the raft$/);

		const stored = await member.storage.from('assets').download(`${comicId}/${out.assetId}`);
		expect(stored.error).toBeNull();
		const { data: row } = await member
			.from('generations')
			.select('status, asset_id, full_prompt, profile_id, aspect')
			.eq('id', out.generationId)
			.single();
		expect(row).toMatchObject({
			status: 'done',
			asset_id: out.assetId,
			profile_id: profileId,
			aspect: '21:9',
			full_prompt: calls[0].prompt
		});
	});

	it('without a style it sends the bare prompt and no references', async () => {
		const { calls, provider } = recording();
		await generatePanelImage(
			member,
			{ comicId, panelId, prompt: 'a heron', box: { w: 100, h: 100 } },
			{ provider }
		);
		expect(calls[0].refs).toEqual([]);
		expect(calls[0].prompt).not.toContain('Style:');
		expect(calls[0].model.key).toBe('gemini-flash');
	});

	it('someone outside the comic is refused before anything is generated', async () => {
		const { calls, provider } = recording();
		await expect(
			generatePanelImage(
				outsider,
				{ comicId, panelId, prompt: 'x', box: { w: 1, h: 1 } },
				{ provider }
			)
		).rejects.toThrow('You don’t have access to this comic.');
		expect(calls).toEqual([]);
	});

	it('a provider failure is logged as failed and passed on', async () => {
		const broken = { generate: async () => Promise.reject(new Error('Gemini: quota exceeded')) };
		await expect(
			generatePanelImage(
				member,
				{ comicId, panelId: 'p-fail', prompt: 'x', box: { w: 1, h: 1 } },
				{ provider: () => broken }
			)
		).rejects.toThrow('Gemini: quota exceeded');
		const { data } = await member
			.from('generations')
			.select('status, error')
			.eq('panel_id', 'p-fail')
			.single();
		expect(data).toEqual({ status: 'failed', error: 'Gemini: quota exceeded' });
	});

	it('an empty prompt or unknown model is refused', async () => {
		const { provider } = recording();
		const req = { comicId, panelId, prompt: '  ', box: { w: 1, h: 1 } };
		await expect(generatePanelImage(member, req, { provider })).rejects.toThrow(/Write a prompt/);
		await expect(
			generatePanelImage(member, { ...req, prompt: 'x', modelKey: 'nope' }, { provider })
		).rejects.toThrow(/Unknown model/);
	});
});

// Integration: generating a panel image against the local stack, with the fake provider.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import { initialState } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';
import { addRef, createProfile, saveProfile, updateRef } from '$lib/styles/styles';
import { fakeProvider, solidPng } from './fake';
import { PRINT_PROMPT, generatePanelImage, saveAgentSketch } from './generate';
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
		await saveProfile(member, profileId, {
			style: 'Loose ink',
			avoid: 'gradients',
			palette: [{ hex: '#1d3557', name: 'deep navy' }]
		});
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
		expect(out).toMatchObject({
			aspect: '21:9',
			model: 'gemini-flash',
			dropped: 0,
			quality: 'draft'
		});
		expect(calls[0].size).toBe('512');
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

	it('a print version redraws the chosen image at 4K, with it as the only reference', async () => {
		const { calls, provider } = recording();
		const draft = await generatePanelImage(
			member,
			{ comicId, panelId, prompt: 'Mae on the raft', profileId, box: { w: 900, h: 300 } },
			{ provider }
		);
		const print = await generatePanelImage(
			member,
			{
				comicId,
				panelId,
				prompt: 'Mae on the raft',
				profileId,
				modelKey: 'hf-grok-image-2', // ignored: prints are always Nano Banana 2
				box: { w: 900, h: 300 },
				quality: 'print',
				sourceAssetId: draft.assetId
			},
			{ provider }
		);
		const req = calls[1];
		expect(req.model.key).toBe('gemini-flash');
		expect(req.size).toBe('4K');
		expect(req.prompt.startsWith(PRINT_PROMPT)).toBe(true);
		// Colours drift in a redraw (seen live: terracotta went salmon), so the palette is named.
		expect(req.prompt).toContain('#1d3557');
		expect(req.refs).toHaveLength(1);
		expect(req.aspect).toBe('21:9'); // the source image's shape, not recomputed from the box
		expect(print).toMatchObject({ quality: 'print', model: 'gemini-flash' });

		const { data: row } = await member
			.from('generations')
			.select('quality, source_asset_id, prompt')
			.eq('id', print.generationId)
			.single();
		expect(row).toEqual({
			quality: 'print',
			source_asset_id: draft.assetId,
			prompt: 'Mae on the raft'
		});
	});

	it('a print version needs an image to start from', async () => {
		const { provider } = recording();
		await expect(
			generatePanelImage(
				member,
				{ comicId, panelId, prompt: 'x', box: { w: 1, h: 1 }, quality: 'print' },
				{ provider }
			)
		).rejects.toThrow(/Generate or place an image first/);
	});

	it('an agent’s sketch is stored as SVG at the panel’s exact shape', async () => {
		const out = await saveAgentSketch(member, {
			comicId,
			panelId,
			box: { w: 900, h: 300 },
			svg: '<svg viewBox="0 0 1000 333"><path d="M0 0 L10 10"/></svg>'
		});
		expect(out).toMatchObject({ aspect: '1000:333', naturalWidth: 1000, naturalHeight: 333 });
		const { data } = await member.storage.from('assets').download(`${comicId}/${out.assetId}`);
		expect(data?.type).toBe('image/svg+xml');
		expect(await data?.text()).toMatch(/^<svg xmlns/);
	});

	it('a sketch has no print version: it is vector already', async () => {
		const { calls, provider } = recording();
		const sketch = await saveAgentSketch(member, {
			comicId,
			panelId,
			box: { w: 1, h: 1 },
			svg: '<svg viewBox="0 0 10 10"><circle r="4"/></svg>'
		});
		await expect(
			generatePanelImage(
				member,
				{
					comicId,
					panelId,
					prompt: 'x',
					box: { w: 1, h: 1 },
					quality: 'print',
					sourceAssetId: sketch.assetId
				},
				{ provider }
			)
		).rejects.toThrow(/vector/);
		expect(calls).toEqual([]);
	});

	it('an agent’s own SVG is sanitised, stored and logged as svg-agent', async () => {
		const out = await saveAgentSketch(member, {
			comicId,
			panelId,
			prompt: 'a heron at dawn',
			box: { w: 900, h: 300 },
			svg: '<svg viewBox="0 0 1000 333"><script>alert(1)</script><circle r="9"/></svg>'
		});
		const { data } = await member.storage.from('assets').download(`${comicId}/${out.assetId}`);
		const text = await data!.text();
		expect(text).toContain('<circle r="9"/>');
		expect(text).not.toContain('script');
		const { data: row } = await member
			.from('generations')
			.select('model, status')
			.eq('id', out.generationId)
			.single();
		expect(row).toEqual({ model: 'svg-agent', status: 'done' });
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

	it('Higgsfield gets a signed link for each reference; an edit model needs one', async () => {
		const { calls, provider } = recording();
		await generatePanelImage(
			member,
			{
				comicId,
				panelId,
				prompt: 'x',
				profileId,
				modelKey: 'hf-grok-image-2',
				box: { w: 1, h: 1 }
			},
			{ provider }
		);
		expect(calls[0].refs).toHaveLength(2);
		for (const r of calls[0].refs) expect(r.url).toMatch(/^http.*style-refs.*token=/);

		await expect(
			generatePanelImage(
				member,
				{ comicId, panelId, prompt: 'x', modelKey: 'hf-qwen-edit', box: { w: 1, h: 1 } },
				{ provider }
			)
		).rejects.toThrow(/at least 1/);
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

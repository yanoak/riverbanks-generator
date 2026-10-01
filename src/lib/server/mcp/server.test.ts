import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryStore } from '$lib/ops/memory-store';
import { OpError, loadComic } from '$lib/ops/ops';
import type { GenerateInput } from '$lib/server/generation/generate';
import type { CastMember, StyleProfile, StyleRef } from '$lib/styles/styles';
import canonJson from '$lib/network/fixture.json';
import { parseNetwork, type Network } from '$lib/network/canon';
import { createMcpServer } from './server';

const INK: StyleProfile = {
	id: '11111111-1111-4111-8111-111111111111',
	createdBy: 'user-2',
	creatorEmail: 'ak@test.local',
	name: 'Tidewater ink',
	style: 'Loose brush ink',
	palette: [{ hex: '#1d3557', name: 'deep navy' }],
	avoid: 'gradients',
	model: null,
	updatedAt: '2026-09-29T00:00:00Z',
	refs: [
		{
			id: 's1',
			profileId: 'p',
			role: 'style',
			label: '',
			castId: null,
			sort: 0,
			width: 1,
			height: 1
		},
		{
			id: 'r1',
			profileId: 'p',
			role: 'character',
			label: '',
			castId: 'c-mae',
			sort: 1,
			width: 1,
			height: 1
		}
	],
	cast: [
		{
			id: 'c-mae',
			profileId: '11111111-1111-4111-8111-111111111111',
			kind: 'character',
			name: 'Mae',
			aliases: ['the girl'],
			description: 'Twelve, red scarf',
			sort: 0,
			portraitId: null
		},
		{
			id: 'c-raft',
			profileId: '11111111-1111-4111-8111-111111111111',
			kind: 'object',
			name: 'the raft',
			aliases: [],
			description: '',
			sort: 1,
			portraitId: null
		}
	]
};

async function connect() {
	const store = new MemoryStore();
	const imported: string[] = [];
	const generated: GenerateInput[] = [];
	const sketches: { svg: string; box: { w: number; h: number } }[] = [];
	const styleCalls: unknown[][] = [];
	let storedNetwork: Network | null = null;
	const ref = (id: string, castId: string | null = null): StyleRef => ({
		id,
		profileId: INK.id,
		role: castId ? 'character' : 'style',
		label: '',
		castId,
		sort: 9,
		width: 640,
		height: 480
	});
	const server = createMcpServer({
		store,
		user: { id: 'user-1', email: 'yan@test.local' },
		appUrl: 'https://app.test',
		importImage: async (_comicId, { url }) => {
			imported.push(url ?? 'base64');
			return { assetId: 'asset-1', naturalWidth: 800, naturalHeight: 600 };
		},
		listStyles: async () => [INK],
		saveSketch: async (input) => {
			if (!input.svg.includes('<svg')) throw new OpError('invalid', 'No <svg> drawing found.');
			sketches.push(input);
			return {
				generationId: 'sketch-1',
				assetId: 'sketch-asset',
				naturalWidth: 1000,
				naturalHeight: 333,
				aspect: '1000:333',
				model: 'svg-agent',
				dropped: 0,
				quality: 'draft',
				cast: []
			};
		},
		network: {
			get: async () =>
				storedNetwork ? { network: storedNetwork, syncedAt: '2026-10-01T00:00:00Z' } : null,
			save: async (input) => (storedNetwork = parseNetwork(input))
		},
		styles: {
			create: async (name) => (styleCalls.push(['create', name]), 'new-style'),
			save: async (id, patch) => void styleCalls.push(['save', id, patch]),
			addReference: async (profileId, source, castId) => (
				styleCalls.push(['addReference', profileId, source, castId]),
				ref('new-ref', castId ?? null)
			),
			addMember: async (profileId, fields) => {
				styleCalls.push(['addMember', profileId, fields]);
				return {
					...INK.cast[0],
					id: 'new-member',
					name: fields.name ?? '',
					kind: fields.kind ?? 'character'
				} as CastMember;
			},
			updateMember: async (member, patch) =>
				void styleCalls.push(['updateMember', member.id, patch]),
			drawPortrait: async (profileId, castId, model) => (
				styleCalls.push(['drawPortrait', profileId, castId, model]),
				ref('sheet-1', castId)
			)
		},
		generate: async (input) => {
			if (input.prompt === 'fail') throw new Error('Gemini: quota exceeded');
			generated.push(input);
			const print = input.quality === 'print';
			return {
				generationId: `gen-${generated.length}`,
				assetId: `generated-${generated.length}`,
				naturalWidth: print ? 6400 : 1600,
				naturalHeight: print ? 3600 : 900,
				aspect: '16:9',
				model: input.modelKey ?? 'gemini-flash',
				dropped: 0,
				quality: input.quality ?? 'draft',
				cast: (input.cast ?? []).map((id) => ({
					id,
					name: INK.cast.find((m) => m.id === id)?.name ?? id,
					image: id === 'c-mae'
				}))
			};
		}
	});
	const [a, b] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'test', version: '1' });
	await Promise.all([server.connect(a), client.connect(b)]);
	const call = async (name: string, args: Record<string, unknown> = {}) => {
		const res = (await client.callTool({ name, arguments: args })) as {
			content: { text: string }[];
			structuredContent?: unknown;
			isError?: boolean;
		};
		return { text: res.content[0].text, isError: !!res.isError, structured: res.structuredContent };
	};
	return { client, call, store, imported, generated, sketches, styleCalls };
}

describe('Riverbanks MCP server', () => {
	it('lists every editing tool', async () => {
		const { client } = await connect();
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(
			[
				'add_balloon',
				'add_free_panel',
				'add_page',
				'create_comic',
				'delete_balloon',
				'delete_comic',
				'delete_page',
				'get_comic',
				'list_comics',
				'merge_panels',
				'move_page',
				'remove_panel_image',
				'rename_comic',
				'set_grid',
				'set_panel_image',
				'list_style_profiles',
				'create_style_profile',
				'add_style_reference',
				'set_cast_member',
				'generate_cast_portrait',
				'get_story_network',
				'set_story_network',
				'set_comic_style',
				'generate_panel_image',
				'make_print_version',
				'draw_panel_svg',
				'split_panel',
				'search',
				'fetch',
				'whoami',
				'update_balloon',
				'update_panel'
			].sort()
		);
	});

	it('annotates every tool so clients can skip confirmations on reads and flag deletes', async () => {
		const { client } = await connect();
		const tools = (await client.listTools()).tools;
		const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]));
		for (const t of tools) expect(t.annotations, `${t.name} has annotations`).toBeDefined();

		expect(by.generate_panel_image.openWorldHint).toBe(true);
		for (const read of [
			'list_comics',
			'get_comic',
			'search',
			'fetch',
			'whoami',
			'list_style_profiles'
		]) {
			expect(by[read].readOnlyHint, read).toBe(true);
		}
		for (const del of ['delete_comic', 'delete_page', 'delete_balloon', 'remove_panel_image']) {
			expect(by[del].destructiveHint, del).toBe(true);
			expect(by[del].readOnlyHint, del).toBe(false);
		}
		for (const write of ['create_comic', 'merge_panels', 'add_balloon', 'update_balloon']) {
			expect(by[write].readOnlyHint, write).toBe(false);
			expect(by[write].destructiveHint, write).toBe(false);
		}
		expect(by.set_panel_image.openWorldHint).toBe(true);
		expect(by.list_comics.openWorldHint).toBe(false);
		expect(by.rename_comic.idempotentHint).toBe(true);
		expect(by.add_balloon.idempotentHint).toBe(false);
	});

	describe('story network', () => {
		it('saves a valid network, reads it back, and refuses a broken one', async () => {
			const { call } = await connect();
			expect((await call('get_story_network')).text).toMatch(/No story network/);
			const saved = await call('set_story_network', { network: canonJson });
			expect(saved.text).toMatch(
				/Saved the story network: \d+ people and \d+ ties across 2 stories\./
			);
			const got = JSON.parse((await call('get_story_network')).text);
			expect(got.syncedAt).toBe('2026-10-01T00:00:00Z');
			expect(got.people.find((p: { id: string }) => p.id === 'nana-oi').died).toBe(2035);

			const bad = structuredClone(canonJson);
			bad.links[0].source = 'nobody';
			const refused = await call('set_story_network', { network: bad });
			expect(refused).toMatchObject({ isError: true, text: expect.stringMatching(/nobody/) });
		});
	});

	describe('styles and generation', () => {
		it('lists the team’s styles with what an agent needs to prompt well', async () => {
			const { call } = await connect();
			const styles = JSON.parse((await call('list_style_profiles')).text);
			expect(styles).toEqual([
				{
					id: INK.id,
					name: 'Tidewater ink',
					style: 'Loose brush ink',
					palette: [{ hex: '#1d3557', name: 'deep navy' }],
					avoid: 'gradients',
					model: null,
					styleReferences: 1,
					cast: [
						{
							id: 'c-mae',
							kind: 'character',
							name: 'Mae',
							aliases: ['the girl'],
							description: 'Twelve, red scarf',
							portraits: 1
						},
						{
							id: 'c-raft',
							kind: 'object',
							name: 'the raft',
							aliases: [],
							description: '',
							portraits: 0
						}
					]
				}
			]);
		});

		it('builds a style and its cast: create, references, members and portraits', async () => {
			const { call, styleCalls } = await connect();
			expect(
				(
					await call('create_style_profile', {
						name: 'House',
						style: 'Ligne claire',
						avoid: 'text'
					})
				).text
			).toBe('Created style House: new-style.');
			expect(styleCalls).toEqual([
				['create', 'House'],
				['save', 'new-style', { style: 'Ligne claire', avoid: 'text' }]
			]);

			const added = await call('set_cast_member', {
				styleProfileId: INK.id,
				name: 'Jalal',
				kind: 'character',
				aliases: [' Jalal the fisher ', ''],
				description: 'Wiry, moustache'
			});
			expect(added.text).toMatch(/Added character Jalal to Tidewater ink: new-member\./);
			expect(styleCalls.at(-1)).toEqual([
				'addMember',
				INK.id,
				{
					kind: 'character',
					name: 'Jalal',
					aliases: ['Jalal the fisher'],
					description: 'Wiry, moustache'
				}
			]);

			// An existing name edits that member rather than adding a second.
			await call('set_cast_member', { styleProfileId: INK.id, name: 'mae', portraitId: 'r1' });
			expect(styleCalls.at(-1)).toEqual([
				'updateMember',
				'c-mae',
				{ name: 'mae', portraitId: 'r1' }
			]);

			const portrait = await call('add_style_reference', {
				styleProfileId: INK.id,
				url: 'https://example.com/mae.png',
				castMember: 'Mae'
			});
			expect(portrait.text).toMatch(/Added a portrait of Mae \(640×480\): new-ref\./);
			expect(styleCalls.at(-1)).toEqual([
				'addReference',
				INK.id,
				{ url: 'https://example.com/mae.png', base64: undefined, mimeType: undefined },
				'c-mae'
			]);

			const sheet = await call('generate_cast_portrait', {
				styleProfileId: INK.id,
				castMember: 'the raft'
			});
			expect(sheet.text).toMatch(
				/Drew a 640×480 sheet of the raft: portrait sheet-1\. As its only portrait/
			);

			const nobody = await call('generate_cast_portrait', {
				styleProfileId: INK.id,
				castMember: 'Zed'
			});
			expect(nobody).toMatchObject({
				isError: true,
				text: expect.stringMatching(/no cast member “Zed”/)
			});
		});

		it('attaches the cast a panel asks for, by name, saves it on the panel and reports it', async () => {
			const { call, store, generated } = await connect();
			const { id } = JSON.parse((await call('create_comic', { title: 'Raft' })).text);
			await call('set_comic_style', { comicId: id, styleProfileId: INK.id });
			const panelId = (await loadComic(store, id)).comic.pages[0].panels[0].id;

			const res = await call('generate_panel_image', {
				comicId: id,
				page: 1,
				panelId,
				prompt: 'dawn on the river',
				cast: ['Mae', 'c-raft']
			});
			expect(res.text).toMatch(/Cast: Mae, the raft \(description only\)\./);
			expect(generated[0].cast).toEqual(['c-mae', 'c-raft']);
			const panel = () =>
				loadComic(store, id).then((l) => l.comic.pages[0].panels.find((p) => p.id === panelId)!);
			expect((await panel()).cast).toEqual(['c-mae', 'c-raft']);

			// Omitting cast keeps the panel's own choice.
			await call('generate_panel_image', { comicId: id, page: 1, panelId, prompt: 'noon' });
			expect(generated[1].cast).toEqual(['c-mae', 'c-raft']);

			const bad = await call('generate_panel_image', {
				comicId: id,
				page: 1,
				panelId,
				prompt: 'x',
				cast: ['Zed']
			});
			expect(bad).toMatchObject({
				isError: true,
				text: expect.stringMatching(/no cast member “Zed”/)
			});
		});

		it('sets and clears a comic’s style; an unknown style is refused', async () => {
			const { call, store } = await connect();
			const { id } = JSON.parse((await call('create_comic', { title: 'Sediment' })).text);
			const set = await call('set_comic_style', { comicId: id, styleProfileId: INK.id });
			expect(set.text).toMatch(/Style set to Tidewater ink\. \(rev \d+\)/);
			expect((await loadComic(store, id)).comic.styleProfileId).toBe(INK.id);
			expect(JSON.parse((await call('get_comic', { comicId: id })).text).style).toEqual({
				id: INK.id,
				name: 'Tidewater ink'
			});

			const bad = await call('set_comic_style', { comicId: id, styleProfileId: 'nope' });
			expect(bad).toMatchObject({ isError: true, text: expect.stringMatching(/No style/) });

			await call('set_comic_style', { comicId: id, styleProfileId: null });
			expect((await loadComic(store, id)).comic.styleProfileId).toBeUndefined();
		});

		it('generates into a panel in the comic’s style, filling it, and keeps the prompt', async () => {
			const { call, store, generated } = await connect();
			const { id } = JSON.parse((await call('create_comic', { title: 'Sediment' })).text);
			await call('set_comic_style', { comicId: id, styleProfileId: INK.id });
			const panelId = (await loadComic(store, id)).comic.pages[0].panels[0].id;

			const res = await call('generate_panel_image', {
				comicId: id,
				page: 1,
				panelId,
				prompt: 'Mae on the raft at dawn'
			});
			expect(res.isError).toBe(false);
			expect(res.text).toMatch(/Generated a 16:9 image with gemini-flash .* \(rev \d+\)/);
			expect(generated[0]).toMatchObject({
				comicId: id,
				panelId,
				prompt: 'Mae on the raft at dawn',
				profileId: INK.id
			});
			expect(generated[0].box.w).toBeGreaterThan(0);

			const panel = (await loadComic(store, id)).comic.pages[0].panels.find(
				(p) => p.id === panelId
			)!;
			expect(panel.image).toMatchObject({ assetId: 'generated-1', naturalWidth: 1600 });
			expect(panel.prompt).toBe('Mae on the raft at dawn');
		});

		it('makes a print version of the panel’s image, keeping its framing', async () => {
			const { call, store, generated } = await connect();
			const { id } = JSON.parse((await call('create_comic', { title: 'Print' })).text);
			const panelId = (await loadComic(store, id)).comic.pages[0].panels[0].id;
			const none = await call('make_print_version', { comicId: id, page: 1, panelId });
			expect(none).toMatchObject({ isError: true, text: expect.stringMatching(/no image/) });

			await call('generate_panel_image', { comicId: id, page: 1, panelId, prompt: 'a heron' });
			const before = (await loadComic(store, id)).comic.pages[0].panels[0].image!;
			const res = await call('make_print_version', { comicId: id, page: 1, panelId });
			expect(res.isError).toBe(false);
			expect(res.text).toMatch(/print version/i);
			expect(generated[1]).toMatchObject({ quality: 'print', sourceAssetId: 'generated-1' });

			const after = (await loadComic(store, id)).comic.pages[0].panels[0].image!;
			expect(after.offsetX).toBe(before.offsetX);
			expect(after.scale * after.naturalWidth).toBeCloseTo(before.scale * before.naturalWidth);
		});

		it('draws a panel from the agent’s own SVG: stored, placed filling it, prompt kept', async () => {
			const { call, store, sketches } = await connect();
			const { id } = JSON.parse((await call('create_comic', { title: 'Sketch' })).text);
			const panelId = (await loadComic(store, id)).comic.pages[0].panels[0].id;
			const svg = '<svg viewBox="0 0 1000 333"><circle r="9"/></svg>';
			const res = await call('draw_panel_svg', {
				comicId: id,
				page: 1,
				panelId,
				svg,
				prompt: 'a heron at dawn'
			});
			expect(res.isError).toBe(false);
			expect(res.text).toMatch(/Drew panel .* as an SVG sketch/);
			expect(sketches[0].svg).toBe(svg);
			expect(sketches[0].box.w).toBeGreaterThan(0);
			const panel = (await loadComic(store, id)).comic.pages[0].panels[0];
			expect(panel.image).toMatchObject({ assetId: 'sketch-asset', naturalWidth: 1000 });
			expect(panel.prompt).toBe('a heron at dawn');

			const bad = await call('draw_panel_svg', { comicId: id, page: 1, panelId, svg: 'nope' });
			expect(bad).toMatchObject({ isError: true, text: expect.stringMatching(/No <svg>/) });
		});

		it('a failed generation is a readable tool error and changes nothing', async () => {
			const { call, store } = await connect();
			const { id } = JSON.parse((await call('create_comic', { title: 'x' })).text);
			const panelId = (await loadComic(store, id)).comic.pages[0].panels[0].id;
			const res = await call('generate_panel_image', {
				comicId: id,
				page: 1,
				panelId,
				prompt: 'fail'
			});
			expect(res).toMatchObject({ isError: true, text: expect.stringContaining('quota exceeded') });
			expect((await loadComic(store, id)).comic.pages[0].panels[0].image).toBeUndefined();
		});
	});

	it('builds a page the way an agent would', async () => {
		const { call } = await connect();
		const { id } = JSON.parse((await call('create_comic', { title: 'Riverbanks' })).text);

		const merged = await call('merge_panels', { comicId: id, page: 1, cells: [0, 1, 4, 5] });
		expect(merged.isError).toBe(false);
		expect(merged.text).toMatch(/Merged 4 cells .* \(rev \d+\)/);

		let d = JSON.parse((await call('get_comic', { comicId: id })).text);
		const revAfterMerge = d.rev;
		const big = d.pages[0].panels.find((p: { cells?: number[] }) => p.cells?.length === 4);

		await call('set_panel_image', {
			comicId: id,
			page: 1,
			panelId: big.id,
			url: 'https://img.test/a.png'
		});
		await call('add_balloon', {
			comicId: id,
			page: 1,
			type: 'speech',
			text: 'THE **TRICK** IS…',
			panelId: big.id
		});

		d = JSON.parse((await call('get_comic', { comicId: id })).text);
		expect(d.rev).toBe(revAfterMerge + 2); // image + balloon: one update each
		expect(d.pages[0].panels.find((p: { id: string }) => p.id === big.id).hasImage).toBe(true);
		expect(d.pages[0].balloons[0]).toMatchObject({ type: 'speech', text: 'THE **TRICK** IS…' });
		expect(d.pages[0].url).toBe(`https://app.test/comics/${id}?page=1`);
	});

	it('returns the editor’s refusal as a readable tool error', async () => {
		const { call } = await connect();
		const { id } = JSON.parse((await call('create_comic', { title: 'X' })).text);
		const res = await call('merge_panels', { comicId: id, page: 1, cells: [0, 5] });
		expect(res.isError).toBe(true);
		expect(res.text).toBe('invalid: Panels must share an edge to merge.');
	});

	it('reports unknown comics as not-found', async () => {
		const { call } = await connect();
		const res = await call('get_comic', { comicId: 'missing' });
		expect(res).toMatchObject({ isError: true, text: 'not-found: No comic with id missing.' });
	});

	it('requires exactly one image source', async () => {
		const { call, imported } = await connect();
		const { id } = JSON.parse((await call('create_comic', { title: 'X' })).text);
		const res = await call('set_panel_image', { comicId: id, page: 1, panelId: 'p' });
		expect(res.isError).toBe(true);
		expect(imported).toEqual([]);
	});

	it('serves a page as a resource', async () => {
		const { client, call } = await connect();
		const { id } = JSON.parse((await call('create_comic', { title: 'X' })).text);
		const res = await client.readResource({ uri: `comic://${id}/page/1` });
		const page = JSON.parse((res.contents[0] as { text: string }).text);
		expect(page.number).toBe(1);
		expect(page.panels).toHaveLength(12);
	});

	describe('deep research tools (OpenAI search/fetch schemas)', () => {
		async function seeded() {
			const c = await connect();
			const { id } = JSON.parse((await c.call('create_comic', { title: 'Sediment' })).text);
			const d = JSON.parse((await c.call('get_comic', { comicId: id })).text);
			await c.call('add_balloon', {
				comicId: id,
				page: 1,
				type: 'speech',
				text: 'The river does not hoard.',
				panelId: d.pages[0].panels[5].id
			});
			return { ...c, id };
		}

		it('search returns {results:[{id,title,url}]} as structured content and as JSON text', async () => {
			const { call, id } = await seeded();
			const res = await call('search', { query: 'HOARD' });
			const expected = {
				results: [{ id, title: 'Sediment', url: `https://app.test/comics/${id}?page=1` }]
			};
			expect(res.structured).toEqual(expected);
			expect(JSON.parse(res.text)).toEqual(expected);
		});

		it('search with no match returns an empty list, not an error', async () => {
			const { call } = await seeded();
			const res = await call('search', { query: 'zeppelin' });
			expect(res.isError).toBe(false);
			expect(res.structured).toEqual({ results: [] });
		});

		it('fetch returns {id,title,text,url,metadata} with the comic as a script', async () => {
			const { call, id } = await seeded();
			const res = await call('fetch', { id });
			const doc = res.structured as {
				id: string;
				title: string;
				text: string;
				url: string;
				metadata: Record<string, unknown>;
			};
			expect(doc).toMatchObject({ id, title: 'Sediment', url: `https://app.test/comics/${id}` });
			expect(doc.text).toContain('speech: The river does not hoard.');
			expect(doc.metadata).toMatchObject({ pages: 1 });
			expect(JSON.parse(res.text)).toEqual(doc);
		});

		it('fetch of an unknown id is a tool error', async () => {
			const { call } = await seeded();
			expect((await call('fetch', { id: 'nope' })).isError).toBe(true);
		});
	});

	it('whoami identifies the signed-in account and is marked as the OpenAI profile tool', async () => {
		const { client, call } = await connect();
		const tool = (await client.listTools()).tools.find((t) => t.name === 'whoami')!;
		expect(tool._meta?.['openai/profile']).toBe(true);
		expect((await call('whoami')).structured).toEqual({ id: 'user-1', email: 'yan@test.local' });
	});
});

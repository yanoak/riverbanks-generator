import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryStore } from '$lib/ops/memory-store';
import { loadComic } from '$lib/ops/ops';
import type { GenerateInput } from '$lib/server/generation/generate';
import type { StyleProfile } from '$lib/styles/styles';
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
		{ id: 'r1', profileId: 'p', role: 'character', label: 'Mae', sort: 0, width: 1, height: 1 }
	]
};

async function connect() {
	const store = new MemoryStore();
	const imported: string[] = [];
	const generated: GenerateInput[] = [];
	const server = createMcpServer({
		store,
		user: { id: 'user-1', email: 'yan@test.local' },
		appUrl: 'https://app.test',
		importImage: async (_comicId, { url }) => {
			imported.push(url ?? 'base64');
			return { assetId: 'asset-1', naturalWidth: 800, naturalHeight: 600 };
		},
		listStyles: async () => [INK],
		generate: async (input) => {
			if (input.prompt === 'fail') throw new Error('Gemini: quota exceeded');
			generated.push(input);
			return {
				generationId: 'gen-1',
				assetId: 'generated-1',
				naturalWidth: 1600,
				naturalHeight: 900,
				aspect: '16:9',
				model: input.modelKey ?? 'gemini-flash',
				dropped: 0
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
	return { client, call, store, imported, generated };
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
				'set_comic_style',
				'generate_panel_image',
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
					references: [{ role: 'character', label: 'Mae' }]
				}
			]);
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

import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryStore } from '$lib/ops/memory-store';
import { createMcpServer } from './server';

async function connect() {
	const store = new MemoryStore();
	const imported: string[] = [];
	const server = createMcpServer({
		store,
		appUrl: 'https://app.test',
		importImage: async ({ url }) => {
			imported.push(url ?? 'base64');
			return { assetId: 'asset-1', naturalWidth: 800, naturalHeight: 600 };
		}
	});
	const [a, b] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'test', version: '1' });
	await Promise.all([server.connect(a), client.connect(b)]);
	const call = async (name: string, args: Record<string, unknown> = {}) => {
		const res = (await client.callTool({ name, arguments: args })) as {
			content: { text: string }[];
			isError?: boolean;
		};
		return { text: res.content[0].text, isError: !!res.isError };
	};
	return { client, call, store, imported };
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
				'split_panel',
				'update_balloon',
				'update_panel'
			].sort()
		);
	});

	it('builds a page the way an agent would', async () => {
		const { call } = await connect();
		const { id } = JSON.parse((await call('create_comic', { title: 'Riverbanks' })).text);

		const merged = await call('merge_panels', { comicId: id, page: 1, cells: [0, 1, 4, 5] });
		expect(merged.isError).toBe(false);
		expect(merged.text).toMatch(/Merged 4 cells .* \(rev 2\)/);

		let d = JSON.parse((await call('get_comic', { comicId: id })).text);
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
		expect(d.rev).toBe(4);
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
		expect(res).toEqual({ isError: true, text: 'not-found: No comic with id missing.' });
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
});

import { expect, test } from '@playwright/test';
import { openEditor, waitForLive } from './support/editor';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { accessToken, createUser } from './support/accounts';
import { oauthToken } from './support/oauth';

async function mcpClient(token: string) {
	const client = new Client({ name: 'e2e', version: '1' });
	await client.connect(
		new StreamableHTTPClientTransport(new URL('http://localhost:4318/mcp'), {
			requestInit: { headers: { Authorization: `Bearer ${token}` } }
		})
	);
	const call = async (name: string, args: Record<string, unknown>) => {
		const res = (await client.callTool({ name, arguments: args })) as {
			content: { text: string }[];
			isError?: boolean;
		};
		if (res.isError) throw new Error(res.content[0].text);
		return res.content[0].text;
	};
	return { client, call };
}

test('/mcp refuses requests without a token', async ({ request }) => {
	const res = await request.post('/mcp', { data: {} });
	expect(res.status()).toBe(401);
	expect(res.headers()['www-authenticate']).toContain('/.well-known/oauth-protected-resource/mcp');
	const meta = await (await request.get('/.well-known/oauth-protected-resource/mcp')).json();
	expect(meta.authorization_servers[0]).toMatch(/\/auth\/v1$/);
});

test('a web-session token is refused at /mcp; only OAuth tokens get in', async ({ request }) => {
	const user = await createUser('session');
	const res = await request.post('/mcp', {
		headers: { authorization: `Bearer ${await accessToken(user.email)}` },
		data: { jsonrpc: '2.0', id: 1, method: 'initialize' }
	});
	expect(res.status()).toBe(401);
	expect(res.headers()['www-authenticate']).toContain('error="invalid_token"');
});

test('an MCP agent edits a comic that is open in the editor, live', async ({ page, request }) => {
	const user = await createUser('mcp');
	const { call } = await mcpClient(await oauthToken(page, request, user.email));

	const { id } = JSON.parse(await call('create_comic', { title: 'Made by an agent' }));
	await page.goto('/comics'); // already signed in by the OAuth consent step
	await expect(page.getByText('Made by an agent')).toBeVisible();
	await openEditor(page, `/comics/${id}`);
	const panels = page.locator('main [data-panel-id]');
	await expect(panels).toHaveCount(12);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await waitForLive(page);

	// Agent merges a block and letters it; the open editor follows without a reload.
	await call('merge_panels', { comicId: id, page: 1, cells: [0, 1, 4, 5] });
	await expect(panels).toHaveCount(9);
	const d = JSON.parse(await call('get_comic', { comicId: id }));
	const big = d.pages[0].panels.find((p: { cells?: number[] }) => p.cells?.length === 4);
	await call('add_balloon', {
		comicId: id,
		page: 1,
		type: 'speech',
		text: 'HELLO FROM **CLAUDE**',
		panelId: big.id
	});
	const text = page.locator('main .balloon-text');
	await expect(text).toHaveText('HELLO FROM CLAUDE');
	await expect(text.locator('strong')).toHaveText('CLAUDE');

	// Agent generates the big panel's image (the fake provider here); the editor shows it and
	// the prompt, as it would any edit.
	await expect(page.locator('main img')).toHaveCount(0);
	const made = await call('generate_panel_image', {
		comicId: id,
		page: 1,
		panelId: big.id,
		prompt: 'A heron over the river'
	});
	expect(made).toMatch(/Generated a \d+:\d+ image/);
	await expect(page.locator('main img').first()).toBeVisible();

	// A local edit and an agent edit at the same moment both survive: no conflict, no overwrite.
	await panels.nth(3).click();
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('m');
	await call('rename_comic', { comicId: id, title: 'Renamed by the agent' });
	const title = page.getByRole('textbox', { name: 'Comic title' });
	await expect(title).toHaveValue('Renamed by the agent');
	await expect(panels).toHaveCount(8);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await expect
		.poll(async () => JSON.parse(await call('get_comic', { comicId: id })).pages[0].panels.length)
		.toBe(8);

	// Both are stored, not just shown.
	await openEditor(page, `/comics/${id}`);
	await expect(panels).toHaveCount(8);
	await expect(title).toHaveValue('Renamed by the agent');
});

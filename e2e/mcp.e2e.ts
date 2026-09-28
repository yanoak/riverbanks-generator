import { expect, test } from '@playwright/test';
import { openEditor } from './support/editor';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { accessToken, createUser, signIn } from './support/accounts';

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

test('an MCP agent edits a comic that is open in the editor, live', async ({ page }) => {
	const user = await createUser('mcp');
	const { call } = await mcpClient(await accessToken(user.email));

	const { id } = JSON.parse(await call('create_comic', { title: 'Made by an agent' }));
	await signIn(page, user.email);
	await expect(page.getByText('Made by an agent')).toBeVisible();
	await openEditor(page, `/comics/${id}`);
	const panels = page.locator('main [data-panel-id]');
	await expect(panels).toHaveCount(12);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

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

	// A local edit that hasn't saved yet + an agent edit = conflict banner, not a silent overwrite.
	await panels.nth(3).click();
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('m'); // unsaved for ~800 ms
	await call('rename_comic', { comicId: id, title: 'Renamed by the agent' });
	await expect(page.getByRole('alert')).toContainText('changed elsewhere');
	await page.getByRole('button', { name: 'Keep mine' }).click();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	const after = JSON.parse(await call('get_comic', { comicId: id }));
	expect(after.pages[0].panels).toHaveLength(8); // my merge won
});

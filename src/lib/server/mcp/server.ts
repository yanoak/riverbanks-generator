// The Riverbanks MCP server: every tool edits a comic through the same model commands as the
// editor (src/lib/ops), against a store that runs as the signed-in user (RLS in production).

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createComic } from '$lib/model/factory';
import type { Comic } from '$lib/model/types';
import * as ops from '$lib/ops/comic-ops';
import { describeComic } from '$lib/ops/describe';
import { migrate } from '$lib/model/serialize';
import { comicScript, searchComic } from '$lib/ops/script';
import { loadComic, mutateComic, OpError } from '$lib/ops/ops';
import { initialState } from '$lib/ops/ydoc-store';
import type { ComicStore } from '$lib/ops/store';
import { panelBox } from '$lib/geometry/panel';
import type { GenerateInput, GenerateResult } from '$lib/server/generation/generate';
import type { StyleProfile } from '$lib/styles/styles';

export interface ImportedImage {
	assetId: string;
	naturalWidth: number;
	naturalHeight: number;
}

export interface McpContext {
	store: ComicStore;
	/** The signed-in user the tools act as. */
	user: { id: string; email: string };
	/** Fetch an image URL (or decode base64) into the user's asset storage. */
	/** Store an image in the comic's folder. */
	importImage: (
		comicId: string,
		source: {
			url?: string;
			base64?: string;
			mimeType?: string;
		}
	) => Promise<ImportedImage>;
	/** Public origin of the app, for view links. */
	appUrl: string;
	/** The team's style profiles. */
	listStyles: () => Promise<StyleProfile[]>;
	/** Generate a panel image into the comic's folder (not yet placed). */
	generate: (input: GenerateInput) => Promise<GenerateResult>;
}

const page = z.number().int().min(1).describe('1-based page number');
const rect = z
	.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
	.describe('Rectangle in page units (page is 1000 wide × 1545 tall, origin top-left)');
const point = z.object({ x: z.number(), y: z.number() }).describe('Point in page units');
const balloonType = z
	.enum(['speech', 'thought', 'whisper', 'shout', 'caption', 'sfx'])
	.describe('speech/thought/whisper/shout have tails; caption is a box; sfx is display lettering');
const border = z.enum(['solid', 'none']);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb colour');

/**
 * MCP tool annotations. ChatGPT asks for confirmation before write actions and skips it for
 * read-only tools; destructive tools get a stronger warning. Claude reads the same hints.
 */
const READ = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false
};
const WRITE = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false
};
const UPDATE = { ...WRITE, idempotentHint: true };
const DELETE = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: true,
	openWorldHint: false
};

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (t: string): Result => ({ content: [{ type: 'text', text: t }] });
const json = (value: unknown): Result => text(JSON.stringify(value, null, 2));

/** Run a tool body, turning OpErrors into tool errors the agent can read and recover from. */
async function guard(body: () => Promise<Result>): Promise<Result> {
	try {
		return await body();
	} catch (e) {
		if (e instanceof OpError) return { ...text(`${e.code}: ${e.message}`), isError: true };
		throw e;
	}
}

export function createMcpServer(ctx: McpContext): McpServer {
	const server = new McpServer(
		{ name: 'riverbanks', version: '1.0.0' },
		{
			instructions:
				'Riverbanks makes comic pages. A page is a grid (default 3 rows × 4 cols, cells numbered ' +
				'0.. row-major) whose cells merge into panels; free panels float above; balloons ' +
				'(speech, thought, whisper, shout, caption, sfx) sit on the page. Call get_comic first ' +
				'and after edits to see ids and geometry. Every edit is saved immediately and shows up ' +
				'live in the user’s open editor.'
		}
	);
	const { store } = ctx;

	/** Edit a comic and reply with the summary line plus the new rev. */
	const edit = (id: string, change: (comic: Comic) => string) =>
		guard(async () => {
			const { rev, summary } = await mutateComic(store, id, change);
			return text(`${summary} (rev ${rev})`);
		});

	// --- comics ------------------------------------------------------------------------------

	server.registerTool(
		'list_comics',
		{
			annotations: READ,
			title: 'List comics',
			description: 'List the user’s comics, most recently edited first.'
		},
		async () => json(await store.list())
	);

	server.registerTool(
		'create_comic',
		{
			annotations: WRITE,
			title: 'Create comic',
			description: 'Create a comic with one page (3×4 grid). Returns its id.',
			inputSchema: { title: z.string().min(1).max(200) }
		},
		async ({ title }) => {
			const comic = createComic(title);
			const record = await store.create(title, comic, initialState(comic));
			return json({ id: record.id, url: `${ctx.appUrl}/comics/${record.id}` });
		}
	);

	server.registerTool(
		'get_comic',
		{
			annotations: READ,
			title: 'Get comic',
			description:
				'Describe a comic: pages, grid, panels (ids, cells, bounding boxes, images) and balloons (ids, type, text, rect, tail tip), with view links.',
			inputSchema: { comicId: z.string() }
		},
		async ({ comicId }) =>
			guard(async () => {
				const { record, comic } = await loadComic(store, comicId);
				const described = describeComic(comic, {
					id: record.id,
					rev: record.rev,
					appUrl: ctx.appUrl
				});
				const style = comic.styleProfileId
					? (await ctx.listStyles()).find((s) => s.id === comic.styleProfileId)
					: undefined;
				return json({
					...described,
					style: comic.styleProfileId
						? { id: comic.styleProfileId, name: style?.name ?? '(deleted)' }
						: null
				});
			})
	);

	server.registerTool(
		'rename_comic',
		{
			annotations: UPDATE,
			title: 'Rename comic',
			inputSchema: { comicId: z.string(), title: z.string().min(1).max(200) }
		},
		async ({ comicId, title }) =>
			edit(comicId, (comic) => {
				comic.title = title;
				return `Renamed to “${title}”.`;
			})
	);

	server.registerTool(
		'delete_comic',
		{
			annotations: DELETE,
			title: 'Delete comic',
			description: 'Permanently delete a comic. Cannot be undone.',
			inputSchema: { comicId: z.string() }
		},
		async ({ comicId }) =>
			(await store.delete(comicId))
				? text(`Deleted comic ${comicId}.`)
				: { ...text(`not-found: No comic with id ${comicId}.`), isError: true }
	);

	// --- pages -------------------------------------------------------------------------------

	server.registerTool(
		'add_page',
		{
			annotations: WRITE,
			title: 'Add page',
			description: 'Add a page after the given page (default: at the end), copying its grid.',
			inputSchema: {
				comicId: z.string(),
				after: z.number().int().min(0).optional(),
				rows: z.number().int().min(1).max(12).optional(),
				cols: z.number().int().min(1).max(12).optional()
			}
		},
		async ({ comicId, after, rows, cols }) =>
			edit(comicId, (c) =>
				ops.addPage(c, { after, grid: { ...(rows ? { rows } : {}), ...(cols ? { cols } : {}) } })
			)
	);

	server.registerTool(
		'delete_page',
		{ annotations: DELETE, title: 'Delete page', inputSchema: { comicId: z.string(), page } },
		async ({ comicId, page: n }) => edit(comicId, (c) => ops.deletePage(c, { page: n }))
	);

	server.registerTool(
		'move_page',
		{
			annotations: WRITE,
			title: 'Move page',
			inputSchema: { comicId: z.string(), page, to: page }
		},
		async ({ comicId, page: n, to }) => edit(comicId, (c) => ops.movePage(c, { page: n, to }))
	);

	server.registerTool(
		'set_grid',
		{
			annotations: UPDATE,
			title: 'Set grid',
			description:
				'Change a page’s grid. Rows/cols can only change while no panels are merged (split first); gutter and margin can always change.',
			inputSchema: {
				comicId: z.string(),
				page,
				rows: z.number().int().min(1).max(12).optional(),
				cols: z.number().int().min(1).max(12).optional(),
				gutter: z.number().min(0).max(80).optional(),
				margin: z.number().min(0).max(200).optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.setGrid(c, args))
	);

	// --- panels ------------------------------------------------------------------------------

	server.registerTool(
		'merge_panels',
		{
			annotations: WRITE,
			title: 'Merge panels',
			description:
				'Merge grid panels into one. Give cell numbers (0-based, row-major; on a 3×4 grid the top row is 0–3) or panel ids. The union must be edge-connected with no enclosed gaps; L and U shapes are fine.',
			inputSchema: {
				comicId: z.string(),
				page,
				cells: z.array(z.number().int().min(0)).min(2).optional(),
				panelIds: z.array(z.string()).min(2).optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.mergePanels(c, args))
	);

	server.registerTool(
		'split_panel',
		{
			annotations: WRITE,
			title: 'Split panel',
			inputSchema: { comicId: z.string(), page, panelId: z.string() }
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.splitPanel(c, args))
	);

	server.registerTool(
		'add_free_panel',
		{
			annotations: WRITE,
			title: 'Add free panel',
			description: 'Add a free-floating (break-out) panel above the grid panels.',
			inputSchema: {
				comicId: z.string(),
				page,
				rect: rect.optional(),
				border: border.optional(),
				fill: color.optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.addFreePanel(c, args).summary)
	);

	server.registerTool(
		'update_panel',
		{
			annotations: UPDATE,
			title: 'Update panel',
			description:
				'Change a panel’s border or fill; for free panels also its rect and stacking (z).',
			inputSchema: {
				comicId: z.string(),
				page,
				panelId: z.string(),
				rect: rect.optional(),
				border: border.optional(),
				fill: color.optional(),
				z: z.number().int().optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.updatePanel(c, args))
	);

	server.registerTool(
		'set_panel_image',
		{
			annotations: { ...WRITE, openWorldHint: true },
			title: 'Set panel image',
			description:
				'Put an image in a panel, from an https URL or base64 data (PNG/JPEG/WebP/GIF/AVIF, max 10 MB). Fills the panel by default.',
			inputSchema: {
				comicId: z.string(),
				page,
				panelId: z.string(),
				url: z.string().url().optional(),
				base64: z.string().optional(),
				mimeType: z.string().optional(),
				fit: z.enum(['fill', 'fit']).optional()
			}
		},
		async ({ comicId, page: n, panelId, url, base64, mimeType, fit }) =>
			guard(async () => {
				if (!url === !base64) throw new OpError('invalid', 'Give exactly one of url or base64.');
				const image = await ctx.importImage(comicId, { url, base64, mimeType });
				const { rev, summary } = await mutateComic(store, comicId, (c) =>
					ops.setPanelImage(c, { page: n, panelId, image, fit })
				);
				return text(`${summary} (rev ${rev})`);
			})
	);

	// --- styles and generation ------------------------------------------------------------

	server.registerTool(
		'list_style_profiles',
		{
			annotations: READ,
			title: 'List style profiles',
			description:
				'The team’s art styles: written style, palette, things to avoid, and reference images (role and name). A comic with a style generates every image in it. Name characters and objects from the references in prompts.'
		},
		async () =>
			guard(async () =>
				json(
					(await ctx.listStyles()).map((s) => ({
						id: s.id,
						name: s.name,
						style: s.style,
						palette: s.palette,
						avoid: s.avoid,
						model: s.model,
						references: s.refs.map((r) => ({ role: r.role, label: r.label }))
					}))
				)
			)
	);

	server.registerTool(
		'set_comic_style',
		{
			annotations: UPDATE,
			title: 'Set comic style',
			description:
				'Choose the style profile generated images in this comic follow, or null for none.',
			inputSchema: { comicId: z.string(), styleProfileId: z.string().nullable() }
		},
		async ({ comicId, styleProfileId }) =>
			guard(async () => {
				const style = styleProfileId
					? (await ctx.listStyles()).find((s) => s.id === styleProfileId)
					: undefined;
				if (styleProfileId && !style)
					throw new OpError('invalid', 'No style with that id; see list_style_profiles.');
				const { rev, summary } = await mutateComic(store, comicId, (c) => {
					if (style) c.styleProfileId = style.id;
					else delete c.styleProfileId;
					return style ? `Style set to ${style.name}.` : 'Style removed.';
				});
				return text(`${summary} (rev ${rev})`);
			})
	);

	server.registerTool(
		'generate_panel_image',
		{
			annotations: { ...WRITE, openWorldHint: true },
			title: 'Generate panel image',
			description:
				'Generate an image for a panel from a prompt, in the comic’s style (its references are attached automatically), at the aspect ratio nearest the panel’s, and fill the panel with it. Describe only what happens in the panel: the style, palette and “no lettering” are added for you, and balloons are separate. Takes 10–60 s.',
			inputSchema: {
				comicId: z.string(),
				page,
				panelId: z.string(),
				prompt: z.string().min(1).max(4000),
				model: z
					.string()
					.optional()
					.describe(
						'Model key, e.g. gemini-flash (default), gemini-pro, hf-grok-image-2. Defaults to the style’s model.'
					)
			}
		},
		async ({ comicId, page: n, panelId, prompt, model }) =>
			guard(async () => {
				const { comic } = await loadComic(store, comicId);
				const at = ops.pageAt(comic, n);
				const target = at.panels.find((p) => p.id === panelId);
				if (!target) throw new OpError('invalid', `Page ${n} has no panel ${panelId}.`);
				let made: GenerateResult;
				try {
					made = await ctx.generate({
						comicId,
						panelId,
						prompt,
						profileId: comic.styleProfileId,
						modelKey: model,
						box: panelBox(at, target)
					});
				} catch (e) {
					if (e instanceof OpError) throw e;
					throw new OpError('invalid', (e as Error).message);
				}
				const image = {
					assetId: made.assetId,
					naturalWidth: made.naturalWidth,
					naturalHeight: made.naturalHeight
				};
				const { rev } = await mutateComic(store, comicId, (c) => {
					ops.setPanelImage(c, { page: n, panelId, image });
					ops.pageAt(c, n).panels.find((p) => p.id === panelId)!.prompt = prompt.trim();
					return '';
				});
				const note = made.dropped
					? ` ${made.dropped} reference image(s) did not fit this model.`
					: '';
				return text(
					`Generated a ${made.aspect} image with ${made.model} and filled panel ${panelId}.${note} (rev ${rev})`
				);
			})
	);

	server.registerTool(
		'remove_panel_image',
		{
			annotations: DELETE,
			title: 'Remove panel image',
			inputSchema: { comicId: z.string(), page, panelId: z.string() }
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.removePanelImage(c, args))
	);

	// --- balloons ----------------------------------------------------------------------------

	const balloonText = z
		.string()
		.max(2000)
		.describe('Balloon text. New lines are separate lines; **bold** and *italic* are supported.');

	server.registerTool(
		'add_balloon',
		{
			annotations: WRITE,
			title: 'Add balloon',
			description:
				'Add a balloon. Place it inside a panel with panelId (sits in the panel’s upper third) or give an explicit rect. tailTip points the tail at a speaker (page units).',
			inputSchema: {
				comicId: z.string(),
				page,
				type: balloonType,
				text: balloonText,
				panelId: z.string().optional(),
				rect: rect.optional(),
				tailTip: point.optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.addBalloon(c, args).summary)
	);

	server.registerTool(
		'update_balloon',
		{
			annotations: UPDATE,
			title: 'Update balloon',
			description:
				'Change a balloon’s text, type, rect, tail (null removes it), font size, font or fill.',
			inputSchema: {
				comicId: z.string(),
				page,
				balloonId: z.string(),
				text: balloonText.optional(),
				type: balloonType.optional(),
				rect: rect.optional(),
				tailTip: point.nullable().optional(),
				fontSize: z.number().min(8).max(200).optional(),
				font: z.string().max(200).optional(),
				fill: color.optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.updateBalloon(c, args))
	);

	server.registerTool(
		'delete_balloon',
		{
			annotations: DELETE,
			title: 'Delete balloon',
			inputSchema: { comicId: z.string(), page, balloonId: z.string() }
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.deleteBalloon(c, args))
	);

	// --- deep research (OpenAI's search/fetch schemas) + profile ------------------------------

	const searchResult = z.object({ id: z.string(), title: z.string(), url: z.string() });

	server.registerTool(
		'search',
		{
			annotations: READ,
			title: 'Search comics',
			description:
				'Search your comics by title and balloon text. Returns matching comics with a link to the first matching page; use fetch with an id for the full script.',
			inputSchema: { query: z.string().min(1).describe('A single query string') },
			outputSchema: { results: z.array(searchResult) }
		},
		async ({ query }) => {
			const results = [];
			for (const record of await store.records()) {
				let comic: Comic;
				try {
					comic = migrate(record.doc);
				} catch {
					continue;
				}
				const hit = searchComic(comic, query);
				if (hit) {
					results.push({
						id: record.id,
						title: record.title,
						url: `${ctx.appUrl}/comics/${record.id}?page=${hit.page}`
					});
				}
			}
			const structuredContent = { results };
			return { ...json(structuredContent), structuredContent };
		}
	);

	server.registerTool(
		'fetch',
		{
			annotations: READ,
			title: 'Fetch comic',
			description:
				'The full text of a comic as a script: every page, panel by panel, with each balloon as “type: text”.',
			inputSchema: { id: z.string().describe('A comic id from search or list_comics') },
			outputSchema: {
				id: z.string(),
				title: z.string(),
				text: z.string(),
				url: z.string(),
				metadata: z.record(z.string(), z.unknown()).optional()
			}
		},
		async ({ id }) =>
			guard(async () => {
				const { record, comic } = await loadComic(store, id);
				const structuredContent = {
					id: record.id,
					title: record.title,
					text: comicScript(comic, { id: record.id, appUrl: ctx.appUrl }),
					url: `${ctx.appUrl}/comics/${record.id}`,
					metadata: { pages: comic.pages.length, rev: record.rev, updatedAt: record.updatedAt }
				};
				return { ...json(structuredContent), structuredContent };
			})
	);

	server.registerTool(
		'whoami',
		{
			annotations: READ,
			title: 'Who am I',
			description: 'The Riverbanks account these tools act as.',
			outputSchema: { id: z.string(), email: z.string() },
			// ChatGPT uses this to tell accounts apart when one person connects several.
			_meta: { 'openai/profile': true }
		},
		async () => {
			const structuredContent = { id: ctx.user.id, email: ctx.user.email };
			return { ...json(structuredContent), structuredContent };
		}
	);

	// --- resources ---------------------------------------------------------------------------

	server.registerResource(
		'comic-page',
		new ResourceTemplate('comic://{comicId}/page/{page}', { list: undefined }),
		{
			title: 'Comic page',
			description: 'One page of a comic, as get_comic describes it.',
			mimeType: 'application/json'
		},
		async (uri, { comicId, page: n }) => {
			const { record, comic } = await loadComic(store, String(comicId));
			const d = describeComic(comic, { id: record.id, rev: record.rev, appUrl: ctx.appUrl });
			const p = d.pages[Number(n) - 1];
			if (!p) throw new OpError('invalid', `There is no page ${n}.`);
			return {
				contents: [
					{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(p, null, 2) }
				]
			};
		}
	);

	return server;
}

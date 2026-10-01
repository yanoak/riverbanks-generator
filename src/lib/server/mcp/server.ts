// The Riverbanks MCP server: every tool edits a comic through the same model commands as the
// editor (src/lib/ops), against a store that runs as the signed-in user (RLS in production).

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createComic, DEFAULT_FORMAT } from '$lib/model/factory';
import type { Comic } from '$lib/model/types';
import * as ops from '$lib/ops/comic-ops';
import { describeComic } from '$lib/ops/describe';
import { migrate } from '$lib/model/serialize';
import { comicScript, searchComic } from '$lib/ops/script';
import { loadComic, mutateComic, OpError } from '$lib/ops/ops';
import { initialState } from '$lib/ops/ydoc-store';
import type { ComicStore } from '$lib/ops/store';
import { panelBox } from '$lib/geometry/panel';
import { FONTS } from '$lib/typography/fonts';
import type { Network } from '$lib/network/canon';
import type { GenerateInput, GenerateResult } from '$lib/server/generation/generate';
import {
	CAST_KINDS,
	type CastMember,
	type CastPatch,
	type ProfilePatch,
	type StyleProfile,
	type StyleRef
} from '$lib/styles/styles';

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
	/** Building styles and their casts, as the user (RLS: only a style's creator can change it). */
	styles?: StyleTools;
	/** The story network shown at /network (internal): read and replace it. */
	network?: {
		get: () => Promise<{ network: Network; syncedAt: string } | null>;
		save: (input: unknown) => Promise<Network>;
	};
	/** Sanitise and store SVG the agent drew itself (not yet placed). */
	saveSketch: (input: {
		comicId: string;
		panelId: string;
		prompt?: string;
		box: { w: number; h: number };
		svg: string;
	}) => Promise<GenerateResult>;
}

export interface StyleTools {
	create: (name: string) => Promise<string>;
	save: (id: string, patch: ProfilePatch) => Promise<void>;
	addReference: (
		profileId: string,
		source: { url?: string; base64?: string; mimeType?: string },
		castId?: string
	) => Promise<StyleRef>;
	addMember: (
		profileId: string,
		fields: Partial<Pick<CastMember, 'kind' | 'name' | 'aliases' | 'description'>>
	) => Promise<CastMember>;
	updateMember: (member: CastMember, patch: CastPatch) => Promise<void>;
	drawPortrait: (profileId: string, castId: string, model?: string) => Promise<StyleRef>;
}

const page = z.number().int().min(1).describe('1-based page number');
const rect = z
	.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
	.describe(
		'Rectangle in page units, origin top-left (an A1 board is 1000 × 1416, a comic page 1000 × 1545; get_comic gives each page’s size)'
	);
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
				'Riverbanks makes comic pages, by default A1 exhibition boards: a header band, a square ' +
				'grid (4 rows × 4 cols, cells numbered 0.. row-major) and a footer band. Grid cells ' +
				'merge into panels; free panels float above; balloons (speech, thought, whisper, shout, ' +
				'caption, sfx) sit on the page and may cross panel borders and the bands, as in a comic. ' +
				'Set band text with set_header_footer. Call get_comic first ' +
				'and after edits to see ids and geometry. Every edit is saved immediately and shows up ' +
				'live in the user’s open editor. A comic’s style may have a cast (list_style_profiles): ' +
				'name a member in a panel prompt, by name or alias, and their portrait and description ' +
				'are attached to that panel.'
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
			description:
				'Create a comic with one page. Returns its id. The default format, board, is an A1 exhibition board: a 4×4 grid in a 1000 × 1000 square between a header band (title, subtitle) and a footer band (left, center, right); set their text with set_header_footer. "comic" is a portrait comic page with a 3×4 grid and no bands. Later pages copy the page they follow.',
			inputSchema: {
				title: z.string().min(1).max(200),
				format: z.enum(['board', 'comic']).optional().describe('Default: board')
			}
		},
		async ({ title, format }) => {
			const comic = createComic(title, format ?? DEFAULT_FORMAT);
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
				'Change a page’s grid. Rows/cols can only change while no panels are merged (split first); gutter, margin and the header (top) and footer (bottom) band heights can always change. 0 removes a band.',
			inputSchema: {
				comicId: z.string(),
				page,
				rows: z.number().int().min(1).max(12).optional(),
				cols: z.number().int().min(1).max(12).optional(),
				gutter: z.number().min(0).max(80).optional(),
				margin: z.number().min(0).max(200).optional(),
				top: z.number().min(0).max(600).optional(),
				bottom: z.number().min(0).max(600).optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.setGrid(c, args))
	);

	const slot = z.string().max(200);
	server.registerTool(
		'set_header_footer',
		{
			annotations: UPDATE,
			title: 'Set header and footer',
			description:
				'Set the text in an A1 board’s header (a large title over a smaller subtitle) and footer (left, center, right). Without a page, it sets the comic’s defaults, which every page shows; with a page, it overrides slots on that page only. Give only the slots to change; "" blanks a slot. {comic}, {page} and {pages} are replaced by the title, the page number and the page count. reset: true first returns the page to the defaults.',
			inputSchema: {
				comicId: z.string(),
				page: page.optional(),
				header: z.object({ title: slot.optional(), subtitle: slot.optional() }).optional(),
				footer: z
					.object({ left: slot.optional(), center: slot.optional(), right: slot.optional() })
					.optional(),
				reset: z.boolean().optional()
			}
		},
		async ({ comicId, ...args }) => edit(comicId, (c) => ops.setBands(c, args))
	);

	// --- panels ------------------------------------------------------------------------------

	server.registerTool(
		'merge_panels',
		{
			annotations: WRITE,
			title: 'Merge panels',
			description:
				'Merge grid panels into one. Give cell numbers (0-based, row-major; on a 4×4 grid the top row is 0–3) or panel ids. The union must be edge-connected with no enclosed gaps; L and U shapes are fine.',
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
				'The team’s art styles: written style, palette, things to avoid, style reference images, and a cast of characters, props and places. A comic with a style generates every image in it. Name cast members (by name or alias) in a panel prompt and their portrait and description are attached to that panel automatically.'
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
						styleReferences: s.refs.filter((r) => !r.castId).length,
						cast: s.cast.map((m) => ({
							id: m.id,
							kind: m.kind,
							name: m.name,
							aliases: m.aliases,
							description: m.description,
							portraits: s.refs.filter((r) => r.castId === m.id).length
						}))
					}))
				)
			)
	);

	const styles = () => {
		if (!ctx.styles) throw new OpError('invalid', 'Editing styles is not available here.');
		return ctx.styles;
	};
	const styleById = async (id: string) => {
		const style = (await ctx.listStyles()).find((st) => st.id === id);
		if (!style) throw new OpError('invalid', 'No style with that id; see list_style_profiles.');
		return style;
	};
	const imageSource = {
		url: z.string().url().optional().describe('A public http(s) image URL'),
		base64: z.string().optional().describe('Image bytes, base64'),
		mimeType: z.string().optional()
	};

	server.registerTool(
		'create_style_profile',
		{
			annotations: WRITE,
			title: 'Create style profile',
			description:
				'Make a new style profile that you can then edit: its written style (medium, linework, rendering), palette and things to avoid. Add style reference images with add_style_reference and a cast with set_cast_member.',
			inputSchema: {
				name: z.string().min(1).max(120),
				style: z.string().max(4000).optional(),
				palette: z
					.array(
						z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), name: z.string().optional() })
					)
					.max(16)
					.optional(),
				avoid: z.string().max(2000).optional(),
				model: z.string().optional().describe('Default model key for comics in this style')
			}
		},
		async ({ name, style, palette, avoid, model }) =>
			guard(async () => {
				const id = await styles().create(name);
				const patch: ProfilePatch = {
					...(style !== undefined && { style }),
					...(palette !== undefined && { palette }),
					...(avoid !== undefined && { avoid }),
					...(model !== undefined && { model })
				};
				if (Object.keys(patch).length) await styles().save(id, patch);
				return text(`Created style ${name}: ${id}.`);
			})
	);

	server.registerTool(
		'add_style_reference',
		{
			annotations: WRITE,
			title: 'Add style reference',
			description:
				'Add an image to a style you made: a style reference (sent with every panel) or, with castMember, a portrait of that cast member (sent only with panels that name them). Give a URL or base64.',
			inputSchema: {
				styleProfileId: z.string(),
				...imageSource,
				castMember: z.string().optional().describe('Cast member id or name this is a portrait of')
			}
		},
		async ({ styleProfileId, url, base64, mimeType, castMember }) =>
			guard(async () => {
				if (!url && !base64) throw new OpError('invalid', 'Give a url or base64.');
				const style = await styleById(styleProfileId);
				const member = castMember
					? style.cast.find(
							(m) => m.id === castMember || m.name.toLowerCase() === castMember.trim().toLowerCase()
						)
					: undefined;
				if (castMember && !member)
					throw new OpError('invalid', `This style has no cast member “${castMember}”.`);
				const ref = await styles().addReference(style.id, { url, base64, mimeType }, member?.id);
				return text(
					member
						? `Added a portrait of ${member.name} (${ref.width}×${ref.height}): ${ref.id}.`
						: `Added a style reference (${ref.width}×${ref.height}): ${ref.id}.`
				);
			})
	);

	server.registerTool(
		'set_cast_member',
		{
			annotations: WRITE,
			title: 'Add or edit a cast member',
			description:
				'Add a character, prop or place to a style you made, or edit one (give its id, or a name it already has). The description says what stays the same in every panel; panels whose prompt uses the name or an alias get the portrait and description. Draw a portrait with generate_cast_portrait.',
			inputSchema: {
				styleProfileId: z.string(),
				id: z.string().optional().describe('An existing member to edit'),
				kind: z.enum(CAST_KINDS as [string, ...string[]]).optional(),
				name: z.string().max(120).optional(),
				aliases: z.array(z.string().max(120)).max(20).optional(),
				description: z.string().max(2000).optional(),
				portraitId: z.string().optional().describe('Which of its portraits to send with panels')
			}
		},
		async ({ styleProfileId, id, kind, name, aliases, description, portraitId }) =>
			guard(async () => {
				const style = await styleById(styleProfileId);
				const fields = {
					...(kind !== undefined && { kind: kind as CastMember['kind'] }),
					...(name !== undefined && { name: name.trim() }),
					...(aliases !== undefined && { aliases: aliases.map((a) => a.trim()).filter(Boolean) }),
					...(description !== undefined && { description: description.trim() })
				};
				const existing =
					style.cast.find((m) => m.id === id) ??
					(!id && name
						? style.cast.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
						: undefined);
				if (id && !existing) throw new OpError('invalid', `This style has no cast member ${id}.`);
				if (existing) {
					await styles().updateMember(existing, {
						...fields,
						...(portraitId !== undefined && { portraitId })
					});
					return text(`Updated ${fields.name ?? existing.name} (${existing.id}).`);
				}
				if (!name?.trim()) throw new OpError('invalid', 'A new cast member needs a name.');
				const m = await styles().addMember(style.id, fields);
				return text(`Added ${m.kind} ${m.name} to ${style.name}: ${m.id}.`);
			})
	);

	server.registerTool(
		'generate_cast_portrait',
		{
			annotations: { ...WRITE, openWorldHint: true },
			title: 'Generate cast portrait',
			description:
				'Draw a reference sheet for a cast member in its style: front, three-quarter and side views for a character or prop, a wide view for a place, from its description, the style references and its current portrait. Adds it to the member’s portraits; star a portrait with set_cast_member portraitId. Takes 10–60 s.',
			inputSchema: {
				styleProfileId: z.string(),
				castMember: z.string().describe('Cast member id or name'),
				model: z.string().optional()
			}
		},
		async ({ styleProfileId, castMember, model }) =>
			guard(async () => {
				const style = await styleById(styleProfileId);
				const member = style.cast.find(
					(m) => m.id === castMember || m.name.toLowerCase() === castMember.trim().toLowerCase()
				);
				if (!member) throw new OpError('invalid', `This style has no cast member “${castMember}”.`);
				const first = !style.refs.some((r) => r.castId === member.id);
				const ref = await styles().drawPortrait(style.id, member.id, model);
				return text(
					`Drew a ${ref.width}×${ref.height} sheet of ${member.name}: portrait ${ref.id}.${
						first ? ' As its only portrait, it is the one sent with panels.' : ''
					}`
				);
			})
	);

	const network = () => {
		if (!ctx.network) throw new OpError('invalid', 'The story network is not available here.');
		return ctx.network;
	};

	server.registerTool(
		'get_story_network',
		{
			annotations: READ,
			title: 'Get story network',
			description:
				'The internal map of the Riverbanks story characters and their ties (shown at /network): stories, people (kind, born, died, stories, summary) and typed links, as JSON, with when it was last synced from the RIVERBOOK doc.'
		},
		async () =>
			guard(async () => {
				const got = await network().get();
				return got
					? json({ syncedAt: got.syncedAt, ...got.network })
					: text('No story network has been synced yet.');
			})
	);

	server.registerTool(
		'set_story_network',
		{
			annotations: { ...UPDATE, idempotentHint: true },
			title: 'Set story network',
			description:
				'Replace the whole story network with a new version, rebuilt from the RIVERBOOK doc (the canon). Give the full document: {meta: {syncedAt, sources, notes}, stories: [{id, title, years, order}], people: [{id, name, kind: person|animal|companion|institution, aliases, born, died, home, stories, summary}], links: [{id, source, target, type: family|inspired|friends|work|member|companion, label, story, year, note}]}. Every link must point at people in it.',
			inputSchema: { network: z.record(z.string(), z.unknown()) }
		},
		async ({ network: input }) =>
			guard(async () => {
				let saved: Network;
				try {
					saved = await network().save(input);
				} catch (e) {
					throw new OpError('invalid', (e as Error).message);
				}
				return text(
					`Saved the story network: ${saved.people.length} people and ${saved.links.length} ties across ${saved.stories.length} stories.`
				);
			})
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
					),
				cast: z
					.array(z.string())
					.optional()
					.describe(
						'Which of the style’s cast to attach, by name or id, instead of those the prompt names. [] for nobody. Saved on the panel; omit to keep the panel’s choice (or auto-detect).'
					)
			}
		},
		async ({ comicId, page: n, panelId, prompt, model, cast }) =>
			guard(async () => {
				const { comic } = await loadComic(store, comicId);
				const at = ops.pageAt(comic, n);
				const target = at.panels.find((p) => p.id === panelId);
				if (!target) throw new OpError('invalid', `Page ${n} has no panel ${panelId}.`);
				let castIds = target.cast;
				if (cast) {
					const members = comic.styleProfileId
						? ((await ctx.listStyles()).find((st) => st.id === comic.styleProfileId)?.cast ?? [])
						: [];
					castIds = cast.map((c) => {
						const m = members.find(
							(x) => x.id === c || x.name.toLowerCase() === c.trim().toLowerCase()
						);
						if (!m) throw new OpError('invalid', `The comic’s style has no cast member “${c}”.`);
						return m.id;
					});
				}
				let made: GenerateResult;
				try {
					made = await ctx.generate({
						comicId,
						panelId,
						prompt,
						profileId: comic.styleProfileId,
						modelKey: model,
						box: panelBox(at, target),
						cast: castIds
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
					const placed = ops.pageAt(c, n).panels.find((p) => p.id === panelId)!;
					placed.prompt = prompt.trim();
					if (cast) placed.cast = castIds;
					return '';
				});
				const note = made.dropped
					? ` ${made.dropped} reference image(s) did not fit this model.`
					: '';
				const who = made.cast?.length
					? ` Cast: ${made.cast.map((c) => (c.image ? c.name : `${c.name} (description only)`)).join(', ')}.`
					: '';
				return text(
					`Generated a ${made.aspect} image with ${made.model} and filled panel ${panelId}.${who}${note} (rev ${rev})`
				);
			})
	);

	server.registerTool(
		'make_print_version',
		{
			annotations: { ...WRITE, openWorldHint: true },
			title: 'Make print version',
			description:
				'Redraw a panel’s current image at 4K for print (Nano Banana 2, about $0.15), changing nothing and keeping its crop. Generate drafts with generate_panel_image first; make print versions only of the chosen ones.',
			inputSchema: { comicId: z.string(), page, panelId: z.string() }
		},
		async ({ comicId, page: n, panelId }) =>
			guard(async () => {
				const { comic } = await loadComic(store, comicId);
				const at = ops.pageAt(comic, n);
				const target = at.panels.find((p) => p.id === panelId);
				if (!target) throw new OpError('invalid', `Page ${n} has no panel ${panelId}.`);
				const from = target.image;
				if (!from)
					throw new OpError('invalid', `Panel ${panelId} has no image to make a print version of.`);
				let made: GenerateResult;
				try {
					made = await ctx.generate({
						comicId,
						panelId,
						prompt: target.prompt || 'print version',
						profileId: comic.styleProfileId,
						box: panelBox(at, target),
						quality: 'print',
						sourceAssetId: from.assetId
					});
				} catch (e) {
					if (e instanceof OpError) throw e;
					throw new OpError('invalid', (e as Error).message);
				}
				const { rev } = await mutateComic(store, comicId, (c) => {
					const panel = ops.pageAt(c, n).panels.find((p) => p.id === panelId);
					if (panel?.image?.assetId !== from.assetId)
						throw new OpError(
							'conflict',
							'The panel’s image changed while the print version was made.'
						);
					panel.image = {
						assetId: made.assetId,
						naturalWidth: made.naturalWidth,
						naturalHeight: made.naturalHeight,
						offsetX: from.offsetX,
						offsetY: from.offsetY,
						scale: from.scale * (from.naturalWidth / made.naturalWidth)
					};
					return '';
				});
				return text(
					`Made a ${made.naturalWidth}×${made.naturalHeight} print version of panel ${panelId}, keeping its crop. (rev ${rev})`
				);
			})
	);

	server.registerTool(
		'draw_panel_svg',
		{
			annotations: WRITE,
			title: 'Draw panel as SVG',
			description:
				'Draw a panel yourself as an SVG sketch, at no image-generation cost. Write one <svg> with a viewBox matching the panel’s shape: take its bbox from get_comic and scale the long side to 1000 (a 900×300 panel is viewBox="0 0 1000 333"). Draw line art with paths, shapes, groups and gradients in the comic’s style (list_style_profiles has its palette and description). No <text>, <image>, scripts or external links: they are removed, and lettering belongs in balloons. The sketch fills the panel and is kept as a take.',
			inputSchema: {
				comicId: z.string(),
				page,
				panelId: z.string(),
				svg: z.string().min(1).max(500_000),
				prompt: z
					.string()
					.max(4000)
					.optional()
					.describe('What the panel shows; kept on the panel for anyone generating it again.')
			}
		},
		async ({ comicId, page: n, panelId, svg, prompt }) =>
			guard(async () => {
				const { comic } = await loadComic(store, comicId);
				const at = ops.pageAt(comic, n);
				const target = at.panels.find((p) => p.id === panelId);
				if (!target) throw new OpError('invalid', `Page ${n} has no panel ${panelId}.`);
				const made = await ctx.saveSketch({
					comicId,
					panelId,
					prompt,
					box: panelBox(at, target),
					svg
				});
				const image = {
					assetId: made.assetId,
					naturalWidth: made.naturalWidth,
					naturalHeight: made.naturalHeight
				};
				const { rev } = await mutateComic(store, comicId, (c) => {
					ops.setPanelImage(c, { page: n, panelId, image });
					if (prompt?.trim())
						ops.pageAt(c, n).panels.find((p) => p.id === panelId)!.prompt = prompt.trim();
					return '';
				});
				return text(`Drew panel ${panelId} as an SVG sketch (${made.aspect}). (rev ${rev})`);
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
				'Change a balloon’s text, type, rect, tail (null removes it), font size, font or fill. ' +
				'A balloon with no font follows its comic style’s lettering for its type; `font` gives it its own ' +
				`(a CSS font-family; loaded fonts: ${FONTS.map((f) => f.family).join(', ')}) and "" hands it back to the style.`,
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

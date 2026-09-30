// Generating one panel's image, as the signed-in user: log the attempt (RLS makes that the
// membership check), compose the prompt from the comic's style, call the provider, store the
// image in the comic's asset folder, and log the result. Placing the image in the document is
// the caller's job: the editor does it as an undoable step, MCP on the server.

import type { SupabaseClient } from '@supabase/supabase-js';
import { exactAspect, nearestAspect } from '$lib/generation/aspect';
import { sanitizeSvg } from '$lib/generation/svg';
import { DEFAULT_MODEL, PRINT_MODEL, modelFor, type ModelInfo } from '$lib/generation/models';
import { composePrompt } from '$lib/generation/prompt';
import { selectRefs } from '$lib/generation/refs';
import { newId } from '$lib/model/factory';
import { OpError } from '$lib/ops/ops';
import { REFS_BUCKET, getProfile, refPath } from '$lib/styles/styles';
import { GENERATED_TYPES, measureImage } from '../mcp/images';
import { loadRefImages } from './refs';
import type { ImageProvider, RefImage } from './provider';

export interface GenerateInput {
	comicId: string;
	panelId: string;
	prompt: string;
	/** The comic's style, if it has one. */
	profileId?: string;
	/** A model registry key; defaults to the style's model, then the app default. */
	modelKey?: string;
	/** The panel's size in page units, for choosing the aspect. */
	box: { w: number; h: number };
	/** A cheap draft (the default), or a print version of `sourceAssetId` at 4K. */
	quality?: Quality;
	/** For a print version: the comic's image to redraw. */
	sourceAssetId?: string;
}

export type Quality = 'draft' | 'print';

/** A print version redraws the chosen image at 4K; it must not become a different picture. */
export const PRINT_PROMPT =
	'Redraw this image at high resolution for print. Keep everything exactly as it is: the ' +
	'composition, framing, characters, poses, colours, linework and texture. Do not add, remove ' +
	'or change anything, and do not add any text.';

export interface GenerateResult {
	generationId: string;
	assetId: string;
	naturalWidth: number;
	naturalHeight: number;
	aspect: string;
	model: string;
	/** References the model had no room for. */
	dropped: number;
	quality: Quality;
}

export interface GenerateDeps {
	provider: (model: ModelInfo) => ImageProvider;
	signal?: AbortSignal;
}

export async function generatePanelImage(
	supabase: SupabaseClient,
	input: GenerateInput,
	deps: GenerateDeps
): Promise<GenerateResult> {
	const prompt = input.prompt.trim();
	if (!prompt) throw new OpError('invalid', 'Write a prompt first.');
	if (prompt.length > 4000) throw new OpError('invalid', 'Keep the prompt under 4000 characters.');

	const quality = input.quality ?? 'draft';
	if (quality === 'print') return printVersion(supabase, { ...input, prompt }, deps);

	const profile = input.profileId ? await getProfile(supabase, input.profileId) : null;
	const modelKey = input.modelKey ?? profile?.model ?? DEFAULT_MODEL;
	const model = modelFor(modelKey);
	if (!model) throw new OpError('invalid', `Unknown model “${modelKey}”.`);

	const { used, dropped } = selectRefs(profile?.refs ?? [], model);
	if (used.length < (model.minRefs ?? 0))
		throw new OpError(
			'invalid',
			`${model.label} redraws reference images: give the comic a style with at least ${model.minRefs}.`
		);
	const aspect = model.anyAspect ? exactAspect(input.box) : nearestAspect(input.box, model.aspects);
	const fullPrompt = composePrompt({ profile: profile ?? undefined, refs: used, prompt });

	const refs: RefImage[] = await loadRefImages(supabase, used);
	if (model.provider === 'higgsfield' && used.length) {
		// Higgsfield fetches references itself: give it short-lived links.
		const { data } = await supabase.storage
			.from(REFS_BUCKET)
			.createSignedUrls(used.map(refPath), 60 * 10);
		data?.forEach((d, i) => (refs[i].url = d.signedUrl ?? undefined));
	}
	return run(
		supabase,
		deps,
		{ ...input, prompt, profileId: profile?.id },
		{
			model,
			aspect,
			fullPrompt,
			quality: 'draft',
			size: model.sizes.draft,
			dropped: dropped.length
		},
		async () => refs
	);
}

/** Redraw an image already in the comic at 4K, with it as the only reference. */
async function printVersion(
	supabase: SupabaseClient,
	input: GenerateInput,
	deps: GenerateDeps
): Promise<GenerateResult> {
	if (!input.sourceAssetId)
		throw new OpError('invalid', 'Generate or place an image first: a print version redraws it.');
	const model = modelFor(PRINT_MODEL)!;
	const path = `${input.comicId}/${input.sourceAssetId}`;
	// Redraws drift in colour (terracotta turned salmon in a live test): name the exact palette.
	const profile = input.profileId ? await getProfile(supabase, input.profileId) : null;
	const palette = profile?.palette.map((c) => (c.name ? `${c.hex} (${c.name})` : c.hex)) ?? [];
	const fullPrompt = palette.length
		? `${PRINT_PROMPT} Match the image's colours exactly; they come from this palette: ${palette.join(', ')}.`
		: PRINT_PROMPT;
	const load = async (): Promise<RefImage[]> => {
		const { data, error } = await supabase.storage.from('assets').download(path);
		if (error || !data) throw new Error(`Could not read the image to redraw: ${error?.message}`);
		const bytes = new Uint8Array(await data.arrayBuffer());
		return [{ bytes, mimeType: measureImage(bytes, data.type || '', GENERATED_TYPES).mimeType }];
	};
	// Keep the source's shape: the panel may have been reshaped since, and the crop is set.
	const source = measureImage((await load())[0].bytes, '', GENERATED_TYPES);
	if (source.mimeType === 'image/svg+xml')
		throw new OpError('invalid', 'Sketches are vector: they print at any size already.');
	const aspect = nearestAspect({ w: source.width, h: source.height }, model.aspects);
	return run(
		supabase,
		deps,
		input,
		{
			model,
			aspect,
			fullPrompt,
			quality: 'print',
			size: model.sizes.print,
			dropped: 0
		},
		load
	);
}

/**
 * SVG an agent drew itself (MCP draw_panel_svg): sanitised, then stored and logged through the
 * same path as a generation, as model `svg-agent`.
 */
export async function saveAgentSketch(
	supabase: SupabaseClient,
	input: Pick<GenerateInput, 'comicId' | 'panelId' | 'box'> & { prompt?: string; svg: string }
): Promise<GenerateResult> {
	let svg: string;
	try {
		svg = sanitizeSvg(input.svg);
	} catch (e) {
		throw new OpError('invalid', (e as Error).message);
	}
	const model = modelFor('svg-agent')!;
	const prompt = input.prompt?.trim() || 'sketch';
	const bytes = new TextEncoder().encode(svg);
	return run(
		supabase,
		{ provider: () => ({ generate: async () => ({ bytes, mimeType: 'image/svg+xml' }) }) },
		{ ...input, prompt },
		{
			model,
			aspect: exactAspect(input.box),
			fullPrompt: prompt,
			quality: 'draft',
			size: 'svg',
			dropped: 0
		},
		async () => []
	);
}

interface Plan {
	model: ModelInfo;
	aspect: string;
	fullPrompt: string;
	quality: Quality;
	size: string;
	dropped: number;
}

/** Log the attempt, generate, store the image, log the result. */
async function run(
	supabase: SupabaseClient,
	deps: GenerateDeps,
	input: GenerateInput,
	plan: Plan,
	refs: () => Promise<RefImage[]>
): Promise<GenerateResult> {
	const { model, aspect, fullPrompt, quality, size } = plan;
	const { data: row, error } = await supabase
		.from('generations')
		.insert({
			comic_id: input.comicId,
			panel_id: input.panelId,
			profile_id: input.profileId ?? null,
			model: model.key,
			prompt: input.prompt,
			full_prompt: fullPrompt,
			aspect,
			quality,
			source_asset_id: input.sourceAssetId ?? null
		})
		.select('id')
		.single();
	if (error) {
		if (error.code === '42501' || error.code === '23503')
			throw new OpError('not-found', 'You don’t have access to this comic.');
		throw new Error(`Could not start the generation: ${error.message}`);
	}
	const generationId = row.id as string;
	const finish = (fields: Record<string, unknown>) =>
		supabase
			.from('generations')
			.update({ ...fields, finished_at: new Date().toISOString() })
			.eq('id', generationId);

	try {
		const image = await deps.provider(model).generate({
			model,
			prompt: fullPrompt,
			refs: await refs(),
			aspect,
			size,
			signal: deps.signal,
			onJob: (ref) => void finish({ provider_ref: ref }).then(() => {})
		});
		const measured = measureImage(image.bytes, image.mimeType, GENERATED_TYPES);
		const assetId = newId();
		const up = await supabase.storage
			.from('assets')
			.upload(`${input.comicId}/${assetId}`, measured.bytes, { contentType: measured.mimeType });
		if (up.error) throw new Error(`Storing the image failed: ${up.error.message}`);

		await finish({
			status: 'done',
			asset_id: assetId,
			width: measured.width,
			height: measured.height
		});
		return {
			generationId,
			assetId,
			naturalWidth: measured.width,
			naturalHeight: measured.height,
			aspect,
			model: model.key,
			dropped: plan.dropped,
			quality
		};
	} catch (e) {
		await finish({ status: 'failed', error: (e as Error).message.slice(0, 1000) });
		throw e;
	}
}

// Generating one panel's image, as the signed-in user: log the attempt (RLS makes that the
// membership check), compose the prompt from the comic's style, call the provider, store the
// image in the comic's asset folder, and log the result. Placing the image in the document is
// the caller's job: the editor does it as an undoable step, MCP on the server.

import type { SupabaseClient } from '@supabase/supabase-js';
import { nearestAspect } from '$lib/generation/aspect';
import { DEFAULT_MODEL, modelFor, type ModelInfo } from '$lib/generation/models';
import { composePrompt } from '$lib/generation/prompt';
import { selectRefs } from '$lib/generation/refs';
import { newId } from '$lib/model/factory';
import { OpError } from '$lib/ops/ops';
import { REFS_BUCKET, getProfile, refPath } from '$lib/styles/styles';
import { measureImage } from '../mcp/images';
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
}

export interface GenerateResult {
	generationId: string;
	assetId: string;
	naturalWidth: number;
	naturalHeight: number;
	aspect: string;
	model: string;
	/** References the model had no room for. */
	dropped: number;
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

	const profile = input.profileId ? await getProfile(supabase, input.profileId) : null;
	const modelKey = input.modelKey ?? profile?.model ?? DEFAULT_MODEL;
	const model = modelFor(modelKey);
	if (!model) throw new OpError('invalid', `Unknown model “${modelKey}”.`);

	const { used, dropped } = selectRefs(profile?.refs ?? [], model);
	const aspect = nearestAspect(input.box, model.aspects);
	const fullPrompt = composePrompt({ profile: profile ?? undefined, refs: used, prompt });

	const { data: row, error } = await supabase
		.from('generations')
		.insert({
			comic_id: input.comicId,
			panel_id: input.panelId,
			profile_id: profile?.id ?? null,
			model: model.key,
			prompt,
			full_prompt: fullPrompt,
			aspect
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
		const refs: RefImage[] = await loadRefImages(supabase, used);
		if (model.provider === 'higgsfield' && used.length) {
			// Higgsfield fetches references itself: give it short-lived links.
			const { data } = await supabase.storage
				.from(REFS_BUCKET)
				.createSignedUrls(used.map(refPath), 60 * 10);
			data?.forEach((d, i) => (refs[i].url = d.signedUrl ?? undefined));
		}
		const image = await deps.provider(model).generate({
			model,
			prompt: fullPrompt,
			refs,
			aspect,
			signal: deps.signal,
			onJob: (ref) => void finish({ provider_ref: ref }).then(() => {})
		});
		const measured = measureImage(image.bytes, image.mimeType);
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
			dropped: dropped.length
		};
	} catch (e) {
		await finish({ status: 'failed', error: (e as Error).message.slice(0, 1000) });
		throw e;
	}
}

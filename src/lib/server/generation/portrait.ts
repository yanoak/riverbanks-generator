// Generating a cast member's reference sheet in its style: the style references and the
// member's description, drawn by the style's model, stored as one more of its portraits.

import type { SupabaseClient } from '@supabase/supabase-js';
import { nearestAspect } from '$lib/generation/aspect';
import { DEFAULT_MODEL, modelFor } from '$lib/generation/models';
import { composePrompt } from '$lib/generation/prompt';
import { planRefs } from '$lib/generation/refs';
import { sheetPrompt } from '$lib/generation/sheet';
import { OpError } from '$lib/ops/ops';
import { addRef, getProfile, portraitRole, type StyleRef } from '$lib/styles/styles';
import { GENERATED_TYPES, measureImage } from '../mcp/images';
import type { GenerateDeps } from './generate';
import { loadRefImages } from './refs';

export async function generatePortrait(
	supabase: SupabaseClient,
	input: { profileId: string; castId: string; modelKey?: string },
	deps: GenerateDeps
): Promise<StyleRef> {
	const profile = await getProfile(supabase, input.profileId);
	const member = profile?.cast.find((m) => m.id === input.castId);
	if (!profile || !member) throw new OpError('not-found', 'That cast member no longer exists.');
	const model = modelFor(input.modelKey ?? profile.model ?? DEFAULT_MODEL);
	if (!model) throw new OpError('invalid', 'Unknown model.');
	if (!model.maxRefs)
		throw new OpError('invalid', `${model.label} cannot take the style’s images.`);

	// The style's look, plus the member's current portrait if it has one, to stay on model.
	const { used, cast } = planRefs(profile.refs, model, [member]);
	const prompt = sheetPrompt(member);
	const fullPrompt = composePrompt({
		profile,
		refs: used.map((r) =>
			r.castId ? { role: member.kind, label: member.name } : { role: 'style', label: '' }
		),
		cast: cast.map(({ image }) => ({ name: member.name, description: member.description, image })),
		prompt
	});
	const image = await deps.provider(model).generate({
		model,
		prompt: fullPrompt,
		refs: await loadRefImages(supabase, used),
		aspect: nearestAspect(
			member.kind === 'place' ? { w: 16, h: 9 } : { w: 3, h: 2 },
			model.aspects
		),
		size: model.sizes.draft,
		signal: deps.signal
	});
	const measured = measureImage(image.bytes, image.mimeType, GENERATED_TYPES);
	if (measured.mimeType === 'image/svg+xml')
		throw new OpError('invalid', 'Portraits must be images.');
	return addRef(
		supabase,
		profile.id,
		new Blob([new Uint8Array(measured.bytes)], { type: measured.mimeType }),
		{ width: measured.width, height: measured.height },
		portraitRole(member.kind),
		member.id
	);
}

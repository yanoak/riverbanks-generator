// Style profiles: reference images plus written style context, shared by the whole team
// (the style_profiles migration). Reference files live at style-refs/<profile id>/<ref id>.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PaletteColor {
	hex: string;
	name?: string;
}

export type RefRole = 'style' | 'character' | 'object';
export const REF_ROLES: RefRole[] = ['style', 'character', 'object'];

export interface StyleRef {
	id: string;
	profileId: string;
	role: RefRole;
	label: string;
	sort: number;
	width: number;
	height: number;
}

export interface StyleProfile {
	id: string;
	createdBy: string | null;
	creatorEmail: string | null;
	name: string;
	style: string;
	palette: PaletteColor[];
	avoid: string;
	/** A key in the model registry; null means the default model. */
	model: string | null;
	updatedAt: string;
	refs: StyleRef[];
}

/** Enough to pick a style from a list. */
export type StyleSummary = Pick<StyleProfile, 'id' | 'name' | 'palette'>;

export const summarize = (p: StyleProfile): StyleSummary => ({
	id: p.id,
	name: p.name,
	palette: p.palette
});

export type ProfilePatch = Partial<
	Pick<StyleProfile, 'name' | 'style' | 'palette' | 'avoid' | 'model'>
>;

export const REFS_BUCKET = 'style-refs';
export const MAX_REFS = 14;
export const refPath = (r: Pick<StyleRef, 'profileId' | 'id'>) => `${r.profileId}/${r.id}`;

const COLUMNS =
	'id, created_by, name, style, palette, avoid, model, updated_at, ' +
	'style_refs (id, profile_id, role, label, sort, width, height)';

type RefRow = {
	id: string;
	profile_id: string;
	role: RefRole;
	label: string;
	sort: number;
	width: number;
	height: number;
};
type Row = {
	id: string;
	created_by: string | null;
	name: string;
	style: string;
	palette: PaletteColor[];
	avoid: string;
	model: string | null;
	updated_at: string;
	style_refs: RefRow[];
};

const toRef = (r: RefRow): StyleRef => ({
	id: r.id,
	profileId: r.profile_id,
	role: r.role,
	label: r.label,
	sort: r.sort,
	width: r.width,
	height: r.height
});

function toProfile(r: Row, emails: Map<string, string>): StyleProfile {
	return {
		id: r.id,
		createdBy: r.created_by,
		creatorEmail: (r.created_by && emails.get(r.created_by)) ?? null,
		name: r.name,
		style: r.style,
		palette: r.palette,
		avoid: r.avoid,
		model: r.model,
		updatedAt: r.updated_at,
		refs: [...r.style_refs].sort((a, b) => a.sort - b.sort).map(toRef)
	};
}

async function creatorEmails(supabase: SupabaseClient): Promise<Map<string, string>> {
	const { data } = await supabase.rpc('style_creators');
	return new Map(
		((data ?? []) as { user_id: string; email: string }[]).map((c) => [c.user_id, c.email])
	);
}

export async function listProfiles(supabase: SupabaseClient): Promise<StyleProfile[]> {
	const [{ data, error }, emails] = await Promise.all([
		supabase.from('style_profiles').select(COLUMNS).order('updated_at', { ascending: false }),
		creatorEmails(supabase)
	]);
	if (error) throw new Error(`Could not load styles: ${error.message}`);
	return (data as unknown as Row[]).map((r) => toProfile(r, emails));
}

export async function getProfile(
	supabase: SupabaseClient,
	id: string
): Promise<StyleProfile | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const [{ data, error }, emails] = await Promise.all([
		supabase.from('style_profiles').select(COLUMNS).eq('id', id).maybeSingle(),
		creatorEmails(supabase)
	]);
	if (error) throw new Error(`Could not load the style: ${error.message}`);
	return data ? toProfile(data as unknown as Row, emails) : null;
}

export async function createProfile(supabase: SupabaseClient, name?: string): Promise<string> {
	const { data, error } = await supabase
		.from('style_profiles')
		.insert(name ? { name } : {})
		.select('id')
		.single();
	if (error) throw new Error(`Could not create the style: ${error.message}`);
	return data.id as string;
}

/** Creator only; anyone else's save throws. */
export async function saveProfile(
	supabase: SupabaseClient,
	id: string,
	patch: ProfilePatch
): Promise<void> {
	const { data, error } = await supabase
		.from('style_profiles')
		.update(patch)
		.eq('id', id)
		.select('id');
	if (error) throw new Error(`Could not save the style: ${error.message}`);
	if (!data?.length) throw new Error('Only the person who made this style can change it.');
}

/** Creator only: the files, then the row (its refs cascade). False if nothing was deleted. */
export async function deleteProfile(supabase: SupabaseClient, id: string): Promise<boolean> {
	const profile = await getProfile(supabase, id);
	if (!profile) return false;
	if (profile.refs.length) {
		await supabase.storage.from(REFS_BUCKET).remove(profile.refs.map(refPath));
	}
	const { data, error } = await supabase.from('style_profiles').delete().eq('id', id).select('id');
	if (error) throw new Error(`Could not delete the style: ${error.message}`);
	return !!data?.length;
}

/** Upload the file, then record it at the end of the list. The file should be downscaled. */
export async function addRef(
	supabase: SupabaseClient,
	profileId: string,
	blob: Blob,
	size: { width: number; height: number },
	role: RefRole = 'style'
): Promise<StyleRef> {
	const { data: last } = await supabase
		.from('style_refs')
		.select('sort')
		.eq('profile_id', profileId)
		.order('sort', { ascending: false })
		.limit(1);
	const id = crypto.randomUUID();
	const up = await supabase.storage
		.from(REFS_BUCKET)
		.upload(`${profileId}/${id}`, blob, { contentType: blob.type });
	if (up.error) throw new Error(`Uploading the reference failed: ${up.error.message}`);
	const { data, error } = await supabase
		.from('style_refs')
		.insert({
			id,
			profile_id: profileId,
			role,
			sort: (last?.[0]?.sort ?? -1) + 1,
			width: size.width,
			height: size.height
		})
		.select('id, profile_id, role, label, sort, width, height')
		.single();
	if (error) {
		await supabase.storage.from(REFS_BUCKET).remove([`${profileId}/${id}`]);
		throw new Error(`Could not add the reference: ${error.message}`);
	}
	return toRef(data as RefRow);
}

export async function updateRef(
	supabase: SupabaseClient,
	id: string,
	patch: Partial<Pick<StyleRef, 'role' | 'label' | 'sort'>>
): Promise<void> {
	const { error } = await supabase.from('style_refs').update(patch).eq('id', id);
	if (error) throw new Error(`Could not change the reference: ${error.message}`);
}

export async function removeRef(supabase: SupabaseClient, ref: StyleRef): Promise<void> {
	const { error } = await supabase.from('style_refs').delete().eq('id', ref.id);
	if (error) throw new Error(`Could not remove the reference: ${error.message}`);
	await supabase.storage.from(REFS_BUCKET).remove([refPath(ref)]);
}

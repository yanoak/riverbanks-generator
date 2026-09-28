// Who is on a comic, and inviting or removing them (the comic_members migration's functions).

import type { SupabaseClient } from '@supabase/supabase-js';

export type Role = 'owner' | 'editor';

export interface Person {
	userId: string;
	email: string;
	role: Role;
}

type Row = { user_id: string; email: string; role: Role };
const toPerson = (r: Row): Person => ({ userId: r.user_id, email: r.email, role: r.role });

export async function listPeople(supabase: SupabaseClient, comicId: string): Promise<Person[]> {
	const { data, error } = await supabase.rpc('comic_people', { comic: comicId });
	if (error) throw new Error(`Could not load who has access: ${error.message}`);
	return (data as Row[]).map(toPerson);
}

/** Owner only. Throws with the server's wording (e.g. "No Riverbanks account with that email."). */
export async function invite(
	supabase: SupabaseClient,
	comicId: string,
	email: string
): Promise<Person> {
	const { data, error } = await supabase.rpc('invite_to_comic', {
		comic: comicId,
		invitee_email: email
	});
	if (error) throw new Error(error.message);
	return toPerson((data as Row[])[0]);
}

/** The owner removing an editor, or an editor leaving (userId = themselves). */
export async function removePerson(
	supabase: SupabaseClient,
	comicId: string,
	userId: string
): Promise<void> {
	const { error } = await supabase.rpc('remove_from_comic', { comic: comicId, member: userId });
	if (error) throw new Error(error.message);
}

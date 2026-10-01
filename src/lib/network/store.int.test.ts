// Integration: the story network table against the local stack, via `npm run test:int`.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import canonJson from './fixture.json';
import { addCastMember, addRef, createProfile, updateCastMember } from '$lib/styles/styles';
import { solidPng } from '$lib/server/generation/fake';
import { getNetwork, saveNetwork } from './store';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_TEST_SECRET_KEY;

describe.skipIf(!url || !serviceKey)('story network (RLS)', () => {
	const id = `test-${crypto.randomUUID().slice(0, 8)}`;
	let member: ReturnType<typeof createClient>;

	beforeAll(async () => {
		const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
		const email = `net-${crypto.randomUUID().slice(0, 8)}@test.local`;
		const password = 'correct horse battery';
		await admin.auth.admin.createUser({ email, password, email_confirm: true });
		member = createClient(url!, anonKey!, { auth: { persistSession: false } });
		await member.auth.signInWithPassword({ email, password });
	});

	it('a signed-in member saves and reads it back; a bad network is refused', async () => {
		expect(await getNetwork(member, id)).toBeNull();
		await saveNetwork(member, canonJson, id);
		const got = await getNetwork(member, id);
		expect(got?.network.people.map((p) => p.id)).toContain('mae');

		const bad = structuredClone(canonJson);
		bad.links[0].target = 'nobody';
		await expect(saveNetwork(member, bad, id)).rejects.toThrow(/nobody/);
	});

	it('anonymous visitors read it (the page is public) but cannot change it', async () => {
		const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
		await saveNetwork(member, canonJson, id);
		expect((await getNetwork(anon, id))?.network.people.length).toBe(canonJson.people.length);
		await expect(saveNetwork(anon, canonJson, `${id}-anon`)).rejects.toThrow();
		await expect(saveNetwork(anon, { ...canonJson, stories: [] }, id)).rejects.toThrow();
	});

	it('publishes the starred cast portrait it names, readable signed out; an unknown cast fails', async () => {
		const styleId = await createProfile(member, 'Net ink');
		const mae = await addCastMember(member, styleId, { kind: 'character', name: 'Mae at 12' });
		const png = (rgb: [number, number, number]) =>
			new Blob([solidPng(2, 2, rgb) as BlobPart], { type: 'image/png' });
		await addRef(member, styleId, png([1, 2, 3]), { width: 2, height: 2 }, 'character', mae.id);
		const starred = await addRef(
			member,
			styleId,
			png([200, 0, 0]),
			{ width: 2, height: 2 },
			'character',
			mae.id
		);
		await updateCastMember(member, mae, { portraitId: starred.id });

		const net = structuredClone(canonJson) as typeof canonJson & Record<string, unknown>;
		(net.meta as Record<string, unknown>).styleProfileId = styleId;
		(net.people[0] as Record<string, unknown>).portraits = [{ cast: 'mae at 12', from: null }];
		const saved = await saveNetwork(member, net, id);
		const published = saved.people[0].portraits[0].url!;
		expect(published).toMatch(
			new RegExp(`/network-portraits/${id}/${mae.id}\\?v=${starred.id.slice(0, 8)}$`)
		);

		const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
		expect((await getNetwork(anon, id))?.network.people[0].portraits[0].url).toBe(published);
		const res = await fetch(published);
		expect(res.ok).toBe(true);
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(bytes.length).toBeGreaterThan(0);

		(net.people[0] as Record<string, unknown>).portraits = [{ cast: 'Nobody', from: null }];
		await expect(saveNetwork(member, net, id)).rejects.toThrow(/no cast member “Nobody”/);
	});
});

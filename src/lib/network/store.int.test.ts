// Integration: the story network table against the local stack, via `npm run test:int`.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import canonJson from './fixture.json';
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
});

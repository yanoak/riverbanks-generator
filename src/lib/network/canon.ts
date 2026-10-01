// The story network: who is in the Riverbanks stories and how they are tied, as one document.
// The Google Doc is canon; the riverbook-network skill rebuilds this from it. Shared by the
// /network route, the MCP tools and the tests (plan 2026-10-01_story-network).

import { z } from 'zod';

const year = z.number().int().min(1800).max(2300).nullable();

export const PERSON_KINDS = ['person', 'animal', 'companion', 'institution'] as const;
export const LINK_TYPES = ['family', 'inspired', 'friends', 'work', 'member', 'companion'] as const;

const story = z.object({
	id: z.string().min(1).max(60),
	title: z.string().min(1).max(200),
	years: z.string().max(60).default(''),
	order: z.number().int().default(0)
});

const portrait = z.object({
	/** A cast member's name in the network's style (meta.styleProfileId). */
	cast: z.string().min(1).max(120),
	/** The year this look starts; null for the default look. */
	from: year.default(null),
	/** Where the face is on the sheet (0–1) and how far to zoom; defaults suit a three-view sheet. */
	focus: z
		.object({
			x: z.number().min(0).max(1),
			y: z.number().min(0).max(1),
			zoom: z.number().min(1).max(20)
		})
		.optional(),
	/** Filled in on save: the public copy of the portrait and its size in pixels. */
	url: z.string().url().optional(),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional()
});

const person = z.object({
	id: z.string().min(1).max(60),
	name: z.string().min(1).max(120),
	kind: z.enum(PERSON_KINDS),
	aliases: z.array(z.string().max(120)).max(20).default([]),
	born: year.default(null),
	died: year.default(null),
	home: z.string().max(200).default(''),
	stories: z.array(z.string()).default([]),
	summary: z.string().max(4000).default(''),
	portraits: z.array(portrait).max(12).default([])
});

const link = z.object({
	id: z.string().min(1).max(120),
	source: z.string(),
	target: z.string(),
	type: z.enum(LINK_TYPES),
	label: z.string().max(200).default(''),
	story: z.string().nullable().default(null),
	year: year.default(null),
	note: z.string().max(2000).default('')
});

const meta = z.object({
	syncedAt: z.string().max(40),
	/** The style whose cast the portraits come from. */
	styleProfileId: z.string().uuid().optional(),
	sources: z.array(z.object({ name: z.string().max(200), url: z.string().url() })).default([]),
	notes: z.array(z.string().max(1000)).default([])
});

const schema = z.object({
	meta,
	stories: z.array(story).max(200),
	people: z.array(person).max(500),
	links: z.array(link).max(2000)
});

export type Network = z.infer<typeof schema>;
export type Person = Network['people'][number];
export type Link = Network['links'][number];
export type Story = Network['stories'][number];
export type Portrait = Person['portraits'][number];

/** The default face crop: the front figure's head on a three-view character sheet. */
export const DEFAULT_FOCUS = { x: 0.17, y: 0.13, zoom: 4.5 };

/** The look for a year: the latest that has started; for all years (null) or before any look
 * starts, the first one listed. */
export function portraitFor<P extends Pick<Portrait, 'from'>>(
	person: { portraits: P[] },
	y: number | null
): P | null {
	const all = person.portraits;
	if (!all.length) return null;
	if (y === null) return all[0];
	const started = all.filter((p) => p.from === null || p.from <= y);
	const dated = started.filter((p) => p.from !== null).sort((a, b) => b.from! - a.from!);
	return dated[0] ?? started[0] ?? all[0];
}

/** Parse and cross-check: ids unique, every link and story reference resolves. Throws with the reason. */
export function parseNetwork(input: unknown): Network {
	const n = schema.parse(input);
	const seen = (what: string, ids: string[]) => {
		const set = new Set<string>();
		for (const id of ids) {
			if (set.has(id)) throw new Error(`The ${what} id “${id}” appears twice.`);
			set.add(id);
		}
		return set;
	};
	const stories = seen(
		'story',
		n.stories.map((s) => s.id)
	);
	const people = seen(
		'person',
		n.people.map((p) => p.id)
	);
	seen(
		'link',
		n.links.map((l) => l.id)
	);
	for (const p of n.people)
		for (const s of p.stories)
			if (!stories.has(s)) throw new Error(`${p.name} is in an unknown story “${s}”.`);
	for (const l of n.links) {
		for (const end of [l.source, l.target])
			if (!people.has(end))
				throw new Error(`Link “${l.id}” points at “${end}”, who is not in the network.`);
		if (l.story && !stories.has(l.story))
			throw new Error(`Link “${l.id}” is in an unknown story “${l.story}”.`);
	}
	return n;
}

/** Age in a given year, or null when the birth year is unknown or the year is before birth. */
export function ageIn(p: Pick<Person, 'born'>, y: number): number | null {
	if (p.born === null || y < p.born) return null;
	return y - p.born;
}

/** Alive in a given year. Unknown birth or death years don't rule anyone out. */
export function aliveIn(p: Pick<Person, 'born' | 'died'>, y: number): boolean {
	if (p.born !== null && y < p.born) return false;
	if (p.died !== null && y > p.died) return false;
	return true;
}

export interface NetworkFilter {
	/** Stories to show; null shows all. A person shows if any of their stories is chosen. */
	stories: Set<string> | null;
	institutions: boolean;
}

export function filterNetwork(n: Network, f: NetworkFilter): Pick<Network, 'people' | 'links'> {
	const people = n.people.filter(
		(p) =>
			(f.institutions || p.kind !== 'institution') &&
			(!f.stories || p.stories.some((s) => f.stories!.has(s)))
	);
	const ids = new Set(people.map((p) => p.id));
	return { people, links: n.links.filter((l) => ids.has(l.source) && ids.has(l.target)) };
}

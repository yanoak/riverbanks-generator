// Which of a style's cast a panel needs: the members its prompt names, by name or alias. Plain
// word matching on purpose — predictable, free, and the generations log can explain every pick.

import type { CastMember } from '$lib/styles/styles';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Members named in the prompt, in the order first named. Longer names win overlaps. */
export function matchCast<M extends Pick<CastMember, 'id' | 'name' | 'aliases'>>(
	prompt: string,
	cast: M[]
): M[] {
	const terms = cast
		.flatMap((m) => [m.name, ...m.aliases].map((t) => ({ term: t.trim(), member: m })))
		.filter((t) => t.term)
		.sort((a, b) => b.term.length - a.term.length);

	const taken: [number, number][] = [];
	const first = new Map<string, number>();
	for (const { term, member } of terms) {
		const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'giu');
		for (const m of prompt.matchAll(re)) {
			const start = m.index;
			const end = start + m[0].length;
			if (taken.some(([s, e]) => start < e && end > s)) continue;
			taken.push([start, end]);
			if (!first.has(member.id) || start < first.get(member.id)!) first.set(member.id, start);
		}
	}
	return cast.filter((m) => first.has(m.id)).sort((a, b) => first.get(a.id)! - first.get(b.id)!);
}

/** The panel's own list when it has one (`undefined` means detect from the prompt). */
export function resolveCast<M extends Pick<CastMember, 'id' | 'name' | 'aliases'>>(
	prompt: string,
	cast: M[],
	override: string[] | undefined
): M[] {
	if (!override) return matchCast(prompt, cast);
	const byId = new Map(cast.map((m) => [m.id, m]));
	return override.map((id) => byId.get(id)).filter((m): m is M => !!m);
}

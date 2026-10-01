// Which of a profile's reference images a generation gets. Style references go with every panel;
// a cast member's portrait goes only when the panel needs that member (generation/cast.ts). All
// within the model's total and per-role caps (Gemini budgets style, character and object images
// separately). A member whose portrait doesn't fit still goes in, as its written description.

import type { CastMember, RefRole, StyleRef } from '$lib/styles/styles';

export interface RefLimits {
	maxRefs: number;
	roleCaps?: Partial<Record<RefRole, number>>;
}

export interface RefPlan<R, M> {
	/** In attachment order: style references, then one portrait per member that fits. */
	used: R[];
	/** References that would have gone but the caps ruled out. */
	dropped: R[];
	/** The panel's members, in order, with their image's 1-based number or null. */
	cast: { member: M; image: number | null }[];
}

const capRole = (kind: CastMember['kind']): RefRole =>
	kind === 'character' ? 'character' : 'object';

export function planRefs<
	R extends Pick<StyleRef, 'id' | 'sort' | 'castId'>,
	M extends Pick<CastMember, 'id' | 'kind' | 'portraitId'>
>(refs: R[], limits: RefLimits, members: M[]): RefPlan<R, M> {
	const sorted = [...refs].sort((a, b) => a.sort - b.sort);
	const used: R[] = [];
	const dropped: R[] = [];
	const counts: Partial<Record<RefRole, number>> = {};
	const take = (r: R, role: RefRole): boolean => {
		const n = counts[role] ?? 0;
		if (used.length >= limits.maxRefs || n >= (limits.roleCaps?.[role] ?? Infinity)) {
			dropped.push(r);
			return false;
		}
		used.push(r);
		counts[role] = n + 1;
		return true;
	};

	for (const r of sorted) if (!r.castId) take(r, 'style');

	const cast = members.map((member) => {
		const own = sorted.filter((r) => r.castId === member.id);
		const portrait = own.find((r) => r.id === member.portraitId) ?? own[0];
		const image = portrait && take(portrait, capRole(member.kind)) ? used.length : null;
		return { member, image };
	});
	return { used, dropped, cast };
}

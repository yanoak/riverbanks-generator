// Which of a profile's references a model gets: in the profile's order, within the model's
// total and per-role caps (Gemini budgets style, character and object images separately).

import type { RefRole, StyleRef } from '$lib/styles/styles';

export interface RefLimits {
	maxRefs: number;
	roleCaps?: Partial<Record<RefRole, number>>;
}

export function selectRefs<R extends Pick<StyleRef, 'role' | 'sort'>>(
	refs: R[],
	limits: RefLimits
): { used: R[]; dropped: R[] } {
	const used: R[] = [];
	const dropped: R[] = [];
	const counts: Partial<Record<RefRole, number>> = {};
	for (const r of [...refs].sort((a, b) => a.sort - b.sort)) {
		const n = counts[r.role] ?? 0;
		const cap = limits.roleCaps?.[r.role] ?? Infinity;
		if (used.length < limits.maxRefs && n < cap) {
			used.push(r);
			counts[r.role] = n + 1;
		} else dropped.push(r);
	}
	return { used, dropped };
}

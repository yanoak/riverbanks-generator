// The prompt for a cast member's reference sheet: several views of the same character, prop or
// place on a plain ground, so later panels have one clear thing to stay consistent with.

import type { CastMember } from '$lib/styles/styles';

export function sheetPrompt(m: Pick<CastMember, 'kind' | 'name' | 'description'>): string {
	const name = m.name.trim() || 'this character';
	const what = m.description.trim();
	const about = what ? ` ${/[.!?]$/.test(what) ? what : `${what}.`}` : '';
	switch (m.kind) {
		case 'character':
			return `A character model sheet of ${name}: the same person drawn three times side by side, front, three-quarter and side view, full body, standing in a neutral pose, on a plain paper-coloured background.${about}`;
		case 'object':
			return `An object model sheet of ${name}: the same object drawn three times side by side, front, three-quarter and side view, on a plain paper-coloured background.${about}`;
		case 'place':
			return `An establishing view of ${name}, wide and clear, with no people in it.${about}`;
	}
}

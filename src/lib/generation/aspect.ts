// Image models only make a fixed list of shapes: take the one nearest the panel, and let
// fitImage('fill') crop the difference.

export const ratioOf = (aspect: string) => {
	const [w, h] = aspect.split(':').map(Number);
	return w / h;
};

/** Nearest in log space, so 2× too wide and 2× too tall count the same. */
export function nearestAspect(box: { w: number; h: number }, aspects: string[]): string {
	const target = Math.log(Math.max(box.w, 1e-6) / Math.max(box.h, 1e-6));
	let best = aspects[0];
	let bestDistance = Infinity;
	for (const a of aspects) {
		const d = Math.abs(Math.log(ratioOf(a)) - target);
		if (d < bestDistance) [best, bestDistance] = [a, d];
	}
	return best;
}

/** Vector sketches take the panel's own shape: the box scaled to 1000 on its long side. */
export function exactAspect(box: { w: number; h: number }): string {
	const k = 1000 / Math.max(box.w, box.h, 1e-6);
	return `${Math.max(1, Math.round(box.w * k))}:${Math.max(1, Math.round(box.h * k))}`;
}

/** The SVG viewBox for an aspect, 1000 on its long side. */
export function viewBoxFor(aspect: string): string {
	const r = ratioOf(aspect);
	const [w, h] = r >= 1 ? [1000, Math.round(1000 / r)] : [Math.round(1000 * r), 1000];
	return `0 0 ${w} ${h}`;
}

// A compact, agent-readable view of a comic: what get_comic returns.

import { panelBox } from '$lib/geometry/panel';
import type { Comic, Rect } from '$lib/model/types';
import { htmlToPlain } from './text';

const round = (r: Rect): Rect => ({
	x: Math.round(r.x),
	y: Math.round(r.y),
	w: Math.round(r.w),
	h: Math.round(r.h)
});

export function describeComic(comic: Comic, meta: { id: string; rev: number; appUrl: string }) {
	return {
		id: meta.id,
		title: comic.title,
		rev: meta.rev,
		units: 'Page units: each page is 1000 wide × 1545 tall; x/y from the top-left.',
		pages: comic.pages.map((page, i) => ({
			number: i + 1,
			id: page.id,
			url: `${meta.appUrl}/comics/${meta.id}?page=${i + 1}`,
			grid: { rows: page.grid.rows, cols: page.grid.cols },
			panels: page.panels
				.map((p) => ({
					id: p.id,
					kind: p.kind,
					...(p.kind === 'grid' ? { cells: [...p.cells].sort((a, b) => a - b) } : { z: p.z }),
					bbox: round(panelBox(page, p)),
					border: p.border,
					hasImage: !!p.image
				}))
				.sort(
					(a, b) =>
						Number(a.kind === 'free') - Number(b.kind === 'free') ||
						('cells' in a && 'cells' in b ? a.cells[0] - b.cells[0] : 0)
				),
			balloons: [...page.balloons]
				.sort((a, b) => a.z - b.z)
				.map((b) => ({
					id: b.id,
					type: b.type,
					text: htmlToPlain(b.html),
					rect: round(b),
					...(b.tail
						? { tailTip: { x: Math.round(b.x + b.tail.x), y: Math.round(b.y + b.tail.y) } }
						: {})
				}))
		}))
	};
}

export type ComicDescription = ReturnType<typeof describeComic>;

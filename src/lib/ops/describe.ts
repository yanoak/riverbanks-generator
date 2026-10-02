// A compact, agent-readable view of a comic: what get_comic returns.

import { gridArea } from '$lib/geometry/grid';
import { fillPercent, imageFocus } from '$lib/geometry/image';
import { panelBox } from '$lib/geometry/panel';
import { resolveBands } from '$lib/model/bands';
import { comicCode, panelRef } from '$lib/model/refs';
import { sfxRotation } from '$lib/model/balloons';
import { formatOf } from '$lib/model/factory';
import type { Balloon, Comic, PanelImage, Rect } from '$lib/model/types';
import { htmlToPlain } from './text';

const round = (r: Rect): Rect => ({
	x: Math.round(r.x),
	y: Math.round(r.y),
	w: Math.round(r.w),
	h: Math.round(r.h)
});

/** How a panel's image is cropped: % of filling the panel, and the point at its centre. */
function crop(img: PanelImage, box: { w: number; h: number }) {
	const focus = imageFocus(img, box);
	const r2 = (n: number) => Math.round(n * 100) / 100;
	return { size: Math.round(fillPercent(img, box)), focus: { x: r2(focus.x), y: r2(focus.y) } };
}

/** The shape settings a balloon has of its own, if any. */
function shapeOf(b: Balloon) {
	const shape = Object.fromEntries(
		(['roundness', 'points', 'depth'] as const).flatMap((k) =>
			b[k] === undefined ? [] : [[k, b[k]]]
		)
	);
	return Object.keys(shape).length ? { shape } : {};
}

export function describeComic(comic: Comic, meta: { id: string; rev: number; appUrl: string }) {
	return {
		id: meta.id,
		title: comic.title,
		code: comicCode(comic),
		rev: meta.rev,
		refs: 'Each panel has a ref, CODE:page:panel in reading order (e.g. TC:2:3), usable wherever a panelId is asked for. Refs are positional: they change when pages move or panels merge.',
		units:
			'Page units, x/y from the top-left. Each page gives its size: an A1 board is 1000 × 1416, with the grid in a 1000 × 1250 area (gridArea, edge to edge) between an 83-unit header and footer band; a comic page is 1000 × 1545. Balloons and free panels may sit anywhere on the page, across panel borders and into the bands.',
		pages: comic.pages.map((page, i) => ({
			number: i + 1,
			id: page.id,
			url: `${meta.appUrl}/comics/${meta.id}?page=${i + 1}`,
			format: formatOf(page) ?? 'custom',
			size: { width: page.width, height: page.height },
			gridArea: gridArea(page.grid, page),
			grid: { rows: page.grid.rows, cols: page.grid.cols },
			...(page.grid.top || page.grid.bottom
				? { bands: { ...resolveBands(comic, i), overrides: page.bands ?? {} } }
				: {}),
			panels: page.panels
				.map((p) => ({
					id: p.id,
					ref: panelRef(comic, i, p.id),
					kind: p.kind,
					...(p.kind === 'grid' ? { cells: [...p.cells].sort((a, b) => a - b) } : { z: p.z }),
					bbox: round(panelBox(page, p)),
					border: p.border,
					hasImage: !!p.image,
					...(p.image ? { image: crop(p.image, panelBox(page, p)) } : {})
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
					...shapeOf(b),
					...(b.anchor ? { anchor: b.anchor } : {}),
					...(b.type === 'sfx' ? { rotation: sfxRotation(b) } : {}),
					...(b.next ? { next: b.next, connector: b.connector ?? 'neck' } : {}),
					...(b.tail
						? { tailTip: { x: Math.round(b.x + b.tail.x), y: Math.round(b.y + b.tail.y) } }
						: {})
				}))
		}))
	};
}

export type ComicDescription = ReturnType<typeof describeComic>;

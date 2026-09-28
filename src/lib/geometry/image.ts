// Image placement inside a panel. Offsets are from the panel bbox's top-left, in page units;
// scale is page units per image pixel.

import type { Delta } from './rect';

export interface Placement {
	offsetX: number;
	offsetY: number;
	scale: number;
}

interface Natural {
	naturalWidth: number;
	naturalHeight: number;
}

const MIN_SCALE = 0.01;
const MAX_SCALE = 20;

/** Centre the image in the box, covering it ('fill') or contained in it ('fit'). */
export function fitImage(
	img: Natural,
	box: { w: number; h: number },
	mode: 'fill' | 'fit'
): Placement {
	const sx = box.w / img.naturalWidth;
	const sy = box.h / img.naturalHeight;
	const scale = mode === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy);
	return {
		scale,
		offsetX: (box.w - img.naturalWidth * scale) / 2,
		offsetY: (box.h - img.naturalHeight * scale) / 2
	};
}

/** Zoom by `factor`, keeping the image point under `anchor` (box coordinates) where it is. */
export function zoomImage<T extends Placement>(
	img: T,
	factor: number,
	anchor: { x: number; y: number }
): T {
	const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, img.scale * factor));
	const k = scale / img.scale;
	return {
		...img,
		scale,
		offsetX: anchor.x - (anchor.x - img.offsetX) * k,
		offsetY: anchor.y - (anchor.y - img.offsetY) * k
	};
}

export function panImage<T extends Placement>(img: T, { dx, dy }: Delta): T {
	return { ...img, offsetX: img.offsetX + dx, offsetY: img.offsetY + dy };
}

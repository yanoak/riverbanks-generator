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
/**
 * How far past filling its panel a generated image is zoomed. Image models sometimes draw their
 * own thin border 2–3% in from the edge; at 1.08 every edge loses ~3.7%, which takes it off.
 */
export const GENERATED_OVERSCAN = 1.08;

/** Fill or fit the box, centred; `overscan` zooms further in (generated images). */
export function fitImage(
	img: Natural,
	box: { w: number; h: number },
	mode: 'fill' | 'fit',
	overscan = 1
): Placement {
	const sx = box.w / img.naturalWidth;
	const sy = box.h / img.naturalHeight;
	const scale = (mode === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy)) * overscan;
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

/**
 * Drag one corner of the image (crop mode) to resize it, aspect ratio locked: the opposite
 * corner stays put, and the pointer (panel-box coordinates) is projected onto the diagonal.
 */
export function resizeFromCorner<T extends Placement>(
	start: T,
	natural: Natural,
	corner: 'tl' | 'tr' | 'bl' | 'br',
	pointer: { x: number; y: number }
): T {
	const w = natural.naturalWidth * start.scale;
	const h = natural.naturalHeight * start.scale;
	const left = corner[1] === 'l';
	const top = corner[0] === 't';
	const anchor = { x: start.offsetX + (left ? w : 0), y: start.offsetY + (top ? h : 0) };
	const d = { x: left ? -w : w, y: top ? -h : h };
	const p = { x: pointer.x - anchor.x, y: pointer.y - anchor.y };
	const t = (p.x * d.x + p.y * d.y) / (d.x * d.x + d.y * d.y);
	return zoomImage(start, Math.max(t, 0.02), anchor);
}

/** The image's size as a percentage of the scale that just fills the box (100 = Fill). */
export function fillPercent(img: Placement & Natural, box: { w: number; h: number }): number {
	return (img.scale / fitImage(img, box, 'fill').scale) * 100;
}

/** Resize to `percent` of filling the box, zooming about the box's centre. */
export function setFillPercent<T extends Placement & Natural>(
	img: T,
	box: { w: number; h: number },
	percent: number
): T {
	return zoomImage(img, percent / fillPercent(img, box), { x: box.w / 2, y: box.h / 2 });
}

/** The point of the image under the panel's centre, as fractions of its width and height. */
export function imageFocus(
	img: Placement & Natural,
	box: { w: number; h: number }
): { x: number; y: number } {
	return {
		x: (box.w / 2 - img.offsetX) / (img.naturalWidth * img.scale),
		y: (box.h / 2 - img.offsetY) / (img.naturalHeight * img.scale)
	};
}

/** Pan so the image's `focus` point (fractions 0–1) sits at the panel's centre; size unchanged. */
export function focusImage<T extends Placement & Natural>(
	img: T,
	box: { w: number; h: number },
	focus: { x: number; y: number }
): T {
	return {
		...img,
		offsetX: box.w / 2 - focus.x * img.naturalWidth * img.scale,
		offsetY: box.h / 2 - focus.y * img.naturalHeight * img.scale
	};
}

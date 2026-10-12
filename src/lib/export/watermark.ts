// A watermark laid diagonally over exported pages (PNG and PDF), never over the editing canvas.
// The setting belongs to the person exporting, not the comic, so it lives in localStorage.
// Plan: 2026-10-12_export-watermark.

export interface WatermarkSetting {
	on: boolean;
	text: string;
}

export interface WatermarkLayout {
	/** The page centre, in page units. */
	x: number;
	y: number;
	/** Degrees; negative runs up from bottom left to top right. */
	angle: number;
	fontSize: number;
}

/** Rough advance of a bold capital in Rubik, in ems; good enough to size the line. */
const ADVANCE = 0.65;

/**
 * Where and how big the text sits: centred, along the page's rising diagonal, about 80% of
 * the diagonal long, and no taller than a fifth of the page. Blank text draws nothing.
 */
export function watermarkLayout(
	width: number,
	height: number,
	text: string
): WatermarkLayout | null {
	const chars = text.trim().length;
	if (!chars) return null;
	const diagonal = Math.hypot(width, height);
	return {
		x: width / 2,
		y: height / 2,
		angle: (-Math.atan2(height, width) * 180) / Math.PI,
		fontSize: Math.min((diagonal * 0.8) / (chars * ADVANCE), height / 5)
	};
}

export type WatermarkStorage = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'riverbanks:watermark';
const OFF: WatermarkSetting = { on: false, text: 'PREVIEW' };

/** The saved setting; anything missing, malformed or unreadable reads as off. */
export function readWatermark(storage: WatermarkStorage | undefined): WatermarkSetting {
	try {
		const v = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<WatermarkSetting> | null;
		if (v && typeof v.on === 'boolean' && typeof v.text === 'string')
			return { on: v.on, text: v.text };
	} catch {
		// Blocked storage or a broken entry: fall through to the default.
	}
	return { ...OFF };
}

export function writeWatermark(
	storage: WatermarkStorage | undefined,
	value: WatermarkSetting
): void {
	try {
		storage?.setItem(KEY, JSON.stringify(value));
	} catch {
		// A private window may refuse; the setting just won't outlive the tab.
	}
}

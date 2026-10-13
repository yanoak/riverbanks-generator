// A watermark laid over exported pages (PNG and PDF), never over the editing canvas: either a
// small tracked line down the right margin (edge, the default) or one big line across the
// diagonal. The setting belongs to the person exporting, not the comic, so it lives in
// localStorage. Plans: 2026-10-12_export-watermark, 2026-10-13_download-modal.

export type WatermarkStyle = 'edge' | 'diagonal';

export interface WatermarkSetting {
	on: boolean;
	text: string;
	style: WatermarkStyle;
}

export interface WatermarkLayout {
	/** The page centre, in page units. */
	x: number;
	y: number;
	/** Degrees; negative runs up from bottom left to top right. */
	angle: number;
	fontSize: number;
	/** Extra space between letters, in ems. */
	letterSpacing: number;
}

/** Rough advance of a bold capital in Rubik, in ems; good enough to size the line. */
const ADVANCE = 0.65;

/** Edge style: tracking, the cap on its size, and the share of the page height it may run. */
const EDGE_TRACKING = 0.4;
const EDGE_MAX_SIZE = 0.018;
const EDGE_MAX_RUN = 0.6;

/**
 * Where and how big the text sits. Diagonal: centred, along the page's rising diagonal, about
 * 80% of the diagonal long, and no taller than a fifth of the page. Edge: reading down the right
 * margin, centred on the page height, at most 1.8% of the width tall and 60% of the height
 * long. Blank text draws nothing.
 */
export function watermarkLayout(
	width: number,
	height: number,
	text: string,
	style: WatermarkStyle = 'diagonal'
): WatermarkLayout | null {
	const chars = text.trim().length;
	if (!chars) return null;
	if (style === 'edge') {
		const fontSize = Math.min(
			width * EDGE_MAX_SIZE,
			(height * EDGE_MAX_RUN) / (chars * (ADVANCE + EDGE_TRACKING))
		);
		return {
			x: width - width * EDGE_MAX_SIZE * 1.1,
			y: height / 2,
			angle: 90,
			fontSize,
			letterSpacing: EDGE_TRACKING
		};
	}
	const diagonal = Math.hypot(width, height);
	return {
		x: width / 2,
		y: height / 2,
		angle: (-Math.atan2(height, width) * 180) / Math.PI,
		fontSize: Math.min((diagonal * 0.8) / (chars * ADVANCE), height / 5),
		letterSpacing: 0
	};
}

export type WatermarkStorage = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'riverbanks:watermark';
const OFF: WatermarkSetting = { on: false, text: 'PREVIEW', style: 'edge' };

/**
 * The saved setting; anything missing, malformed or unreadable reads as off. A setting saved
 * before styles existed, or with an unknown style, gets the edge style.
 */
export function readWatermark(storage: WatermarkStorage | undefined): WatermarkSetting {
	try {
		const v = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<WatermarkSetting> | null;
		if (v && typeof v.on === 'boolean' && typeof v.text === 'string')
			return { on: v.on, text: v.text, style: v.style === 'diagonal' ? 'diagonal' : 'edge' };
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

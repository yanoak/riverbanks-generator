// The sheet a PDF is printed on, and how each page sits on it. "Original" keeps the sheet the
// comic was made for (A1 for boards, US comic trim otherwise); the named papers fit every page
// inside the sheet and centre it. Plan: 2026-10-13_download-modal.

import type { PageFormat } from '$lib/model/factory';
import type { WatermarkStorage } from './watermark';

export type Paper = 'original' | 'b5' | 'a4' | 'a5';
export type ExportFormat = 'pdf' | 'png';

export const PAPERS: { id: Paper; label: string }[] = [
	{ id: 'original', label: 'Original (A1 boards, comic trim)' },
	{ id: 'b5', label: 'B5 · 176 × 250 mm' },
	{ id: 'a4', label: 'A4 · 210 × 297 mm' },
	{ id: 'a5', label: 'A5 · 148 × 210 mm' }
];

const SIZES_MM: Record<Exclude<Paper, 'original'>, [number, number]> = {
	b5: [176, 250],
	a4: [210, 297],
	a5: [148, 210]
};

const A1_MM: [number, number] = [594, 841];
const COMIC_TRIM_MM: [number, number] = [6.625 * 25.4, 10.25 * 25.4];

const PX_PER_MM = 96 / 25.4;

export interface Sheet {
	widthMm: number;
	heightMm: number;
	/** CSS lengths, for @page and the sheet's box. */
	width: string;
	height: string;
	/** The sheet's size in CSS px. */
	px: number;
	pxHeight: number;
}

export function sheetFor(paper: Paper, firstPageFormat: PageFormat | null): Sheet {
	const [w, h] =
		paper !== 'original' ? SIZES_MM[paper] : firstPageFormat === 'board' ? A1_MM : COMIC_TRIM_MM;
	return {
		widthMm: w,
		heightMm: h,
		width: `${w}mm`,
		height: `${h}mm`,
		px: w * PX_PER_MM,
		pxHeight: h * PX_PER_MM
	};
}

/** Scale (CSS px per page unit) and offsets (CSS px) that fit a page inside a sheet, centred. */
export function fitPage(
	sheet: Sheet,
	page: { width: number; height: number }
): { scale: number; left: number; top: number } {
	const scale = Math.min(sheet.px / page.width, sheet.pxHeight / page.height);
	return {
		scale,
		left: (sheet.px - page.width * scale) / 2,
		top: (sheet.pxHeight - page.height * scale) / 2
	};
}

export interface ExportPrefs {
	format: ExportFormat;
	paper: Paper;
}

const KEY = 'riverbanks:export';

/** The last choice in this browser; anything missing or unknown falls back to PDF, original. */
export function readExportPrefs(storage: WatermarkStorage | undefined): ExportPrefs {
	let v: Partial<Record<keyof ExportPrefs, unknown>> | null = null;
	try {
		v = JSON.parse(storage?.getItem(KEY) ?? 'null');
	} catch {
		// Blocked storage or a broken entry: use the defaults.
	}
	return {
		format: v?.format === 'png' ? 'png' : 'pdf',
		paper: PAPERS.some((p) => p.id === v?.paper) ? (v!.paper as Paper) : 'original'
	};
}

export function writeExportPrefs(storage: WatermarkStorage | undefined, value: ExportPrefs): void {
	try {
		storage?.setItem(KEY, JSON.stringify(value));
	} catch {
		// A private window may refuse; the choice just won't outlive the tab.
	}
}

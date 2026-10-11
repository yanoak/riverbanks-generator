// Draw a rendered page as a small image, in the browser. html-to-image inlines every <img> as a
// data URL, and full-size panel images are what made the old PNG export hang; so each image is
// first swapped for a copy at the size it is drawn (× PIXEL_RATIO).
import { toCanvas } from 'html-to-image';
import type { Page } from '$lib/model/types';

const PIXEL_RATIO = 2;
const TIMEOUT_MS = 10_000;

let fontCss: Promise<string> | null = null;
/** Downscaled copies by source URL and width, so drawing the same page again is cheap. */
const small = new Map<string, Promise<string>>();

/** Wait until every panel image on the page is in the node and loaded; false on timeout. */
async function imagesReady(node: HTMLElement, page: Page, ms: number): Promise<boolean> {
	const expected = page.panels.filter((p) => p.image).length;
	const until = Date.now() + ms;
	while (Date.now() < until) {
		const imgs = [...node.querySelectorAll('img')];
		if (imgs.length >= expected && imgs.every((i) => i.complete && i.naturalWidth > 0)) return true;
		await new Promise((r) => setTimeout(r, 100));
	}
	return false;
}

async function downscale(img: HTMLImageElement): Promise<void> {
	if (img.src.startsWith('data:')) return; // done on an earlier capture
	const width = Math.ceil(img.getBoundingClientRect().width * PIXEL_RATIO);
	if (!width || width >= img.naturalWidth) return;
	const src = img.currentSrc || img.src;
	const id = `${width} ${src}`;
	if (!small.has(id))
		small.set(
			id,
			shrink(src, width).catch((e) => {
				small.delete(id); // try again next time
				throw e;
			})
		);
	img.src = await small.get(id)!;
	await img.decode();
}

async function shrink(src: string, width: number): Promise<string> {
	const blob = await (await fetch(src)).blob();
	const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeQuality: 'high' });
	const canvas = document.createElement('canvas');
	[canvas.width, canvas.height] = [bitmap.width, bitmap.height];
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
	bitmap.close();
	return canvas.toDataURL('image/jpeg', 0.9);
}

const unquote = (family: string) => family.trim().replace(/["']/g, '');

const dataUrl = async (url: string) => {
	const blob = await (await fetch(url)).blob();
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
};

/**
 * The @font-face rules the page uses, Basic Latin subsets only, with their files inlined.
 * html-to-image's own embedding keeps every subset of every used family (Cyrillic, Hebrew,
 * Latin Extended…), dozens of files for one card.
 */
async function fontEmbedCss(node: HTMLElement): Promise<string> {
	const used = new Set<string>();
	for (const el of [node, ...node.querySelectorAll<HTMLElement>('*')])
		for (const f of getComputedStyle(el).fontFamily.split(',')) used.add(unquote(f));
	const rules: CSSFontFaceRule[] = [];
	for (const sheet of document.styleSheets) {
		try {
			for (const rule of sheet.cssRules) if (rule instanceof CSSFontFaceRule) rules.push(rule);
		} catch {
			// a stylesheet from another origin without CORS: nothing to read
		}
	}
	const css = await Promise.all(
		rules
			.filter((r) => used.has(unquote(r.style.getPropertyValue('font-family'))))
			.filter((r) => {
				const range = r.style.getPropertyValue('unicode-range');
				return !range || /U\+0+-0*FF\b/i.test(range);
			})
			.map(async (r) => {
				const src = r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)/)?.[1];
				if (!src) return '';
				const url = new URL(src, r.parentStyleSheet?.href ?? location.href).href;
				return r.cssText.replace(src, await dataUrl(url));
			})
	);
	return css.join('\n');
}

const encode = (canvas: HTMLCanvasElement, type: string) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));

async function capture(node: HTMLElement, page: Page): Promise<Blob | null> {
	await document.fonts.ready;
	if (!(await imagesReady(node, page, TIMEOUT_MS / 2))) return null;
	await Promise.all([...node.querySelectorAll('img')].map(downscale));
	fontCss ??= fontEmbedCss(node).catch(() => '');
	const canvas = await toCanvas(node, {
		pixelRatio: PIXEL_RATIO,
		backgroundColor: '#ffffff',
		fontEmbedCSS: await fontCss
	});
	// Safari cannot encode WebP and quietly returns a PNG; JPEG is far smaller.
	const webp = await encode(canvas, 'image/webp');
	return webp?.type === 'image/webp' ? webp : encode(canvas, 'image/jpeg');
}

/**
 * A thumbnail of `node`, a PageView of `page`, or null if its images never loaded or drawing
 * took too long. Never throws: a missing thumbnail only means the card is drawn live.
 */
export async function captureThumbnail(node: HTMLElement, page: Page): Promise<Blob | null> {
	const timeout = new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS));
	try {
		return await Promise.race([capture(node, page), timeout]);
	} catch (e) {
		console.warn('Thumbnail capture failed', e);
		return null;
	}
}

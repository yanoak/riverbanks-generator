import { toPng } from 'html-to-image';

/**
 * Rasterise a rendered page. Waits for web fonts so lettering isn't captured in a fallback
 * face; blob: image URLs and the Google Fonts stylesheet (loaded with crossorigin) are inlined
 * by html-to-image.
 */
export async function pageToPng(node: HTMLElement, pixelRatio = 2): Promise<string> {
	await document.fonts.ready;
	return toPng(node, { pixelRatio, backgroundColor: '#ffffff' });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
	const a = document.createElement('a');
	a.href = dataUrl;
	a.download = filename;
	a.click();
}

export function slug(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'comic'
	);
}

// Reference images go to Storage at most 1536 px on the long side: plenty for a model to read
// a style from, and it keeps a 14-image request small.

export const REF_MAX_SIDE = 1536;

export function fitWithin(width: number, height: number, max: number) {
	const k = Math.min(1, max / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * k)),
		height: Math.max(1, Math.round(height * k))
	};
}

/** Browser only. Returns the original blob when it is already small enough. */
export async function downscale(
	blob: Blob,
	max = REF_MAX_SIDE
): Promise<{ blob: Blob; width: number; height: number }> {
	const bitmap = await createImageBitmap(blob);
	const size = fitWithin(bitmap.width, bitmap.height, max);
	if (size.width === bitmap.width && size.height === bitmap.height) {
		bitmap.close();
		return { blob, ...size };
	}
	const canvas = new OffscreenCanvas(size.width, size.height);
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
	bitmap.close();
	return { blob: await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 }), ...size };
}

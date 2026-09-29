/** A real 1×1 PNG, for uploads the browser has to decode. */
export const PNG_1PX = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

export const pngFile = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG_1PX });

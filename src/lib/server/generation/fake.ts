// The free stand-in (GENERATION_PROVIDER=fake): a flat PNG in the requested shape, its colour
// taken from the prompt so each take looks different. Tests and e2e never spend money.
import { deflateSync } from 'node:zlib';
import { ratioOf } from '$lib/generation/aspect';
import type { ImageProvider } from './provider';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const out = Buffer.alloc(8 + data.length + 4);
	out.writeUInt32BE(data.length, 0);
	body.copy(out, 4);
	out.writeUInt32BE(crc32(body), 8 + data.length);
	return out;
}

/** A solid RGB PNG with a darker frame, so crops are visible. */
export function solidPng(width: number, height: number, [r, g, b]: number[]): Uint8Array {
	const row = 1 + width * 3;
	const raw = Buffer.alloc(row * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const edge = x < 8 || y < 8 || x >= width - 8 || y >= height - 8;
			const k = edge ? 0.5 : 1;
			raw.set([r * k, g * k, b * k], y * row + 1 + x * 3);
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
	return new Uint8Array(
		Buffer.concat([
			Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
			chunk('IHDR', header),
			chunk('IDAT', deflateSync(raw)),
			chunk('IEND', new Uint8Array())
		])
	);
}

export function fakeProvider(): ImageProvider {
	return {
		async generate({ prompt, aspect }) {
			const ratio = ratioOf(aspect);
			const long = 480;
			const [w, h] =
				ratio >= 1 ? [long, Math.round(long / ratio)] : [Math.round(long * ratio), long];
			const hash = [...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
			const colour = [hash & 0xff, (hash >> 8) & 0xff, (hash >> 16) & 0xff].map(
				(v) => 80 + (v % 160)
			);
			return { bytes: solidPng(w, h, colour), mimeType: 'image/png' };
		}
	};
}

import { describe, expect, it } from 'vitest';
import { readWatermark, watermarkLayout, writeWatermark, type WatermarkStorage } from './watermark';

describe('watermarkLayout', () => {
	it('runs up the page diagonal, from bottom left to top right', () => {
		expect(watermarkLayout(1000, 1000, 'PREVIEW')!.angle).toBeCloseTo(-45);
		const board = watermarkLayout(1000, 1416, 'PREVIEW')!;
		expect(board.angle).toBeLessThan(-45);
		expect(board.angle).toBeCloseTo((-Math.atan2(1416, 1000) * 180) / Math.PI);
		expect([board.x, board.y]).toEqual([500, 708]);
	});

	it('fits long text across the diagonal and caps a short word', () => {
		const long = 'PREVIEW — NOT FOR DISTRIBUTION';
		const diagonal = Math.hypot(1000, 1416);
		const { fontSize } = watermarkLayout(1000, 1416, long)!;
		expect(fontSize * long.length * 0.65).toBeCloseTo(diagonal * 0.8);
		expect(watermarkLayout(1000, 1416, 'A')!.fontSize).toBe(1416 / 5);
	});

	it('draws nothing for blank text', () => {
		expect(watermarkLayout(1000, 1416, '')).toBeNull();
		expect(watermarkLayout(1000, 1416, '   ')).toBeNull();
	});
});

function memory(): WatermarkStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v)
	};
}

describe('readWatermark / writeWatermark', () => {
	it('round-trips the setting', () => {
		const storage = memory();
		writeWatermark(storage, { on: true, text: 'DRAFT' });
		expect(readWatermark(storage)).toEqual({ on: true, text: 'DRAFT' });
	});

	it('reads as off with PREVIEW when missing, malformed or unavailable', () => {
		const off = { on: false, text: 'PREVIEW' };
		expect(readWatermark(memory())).toEqual(off);
		const bad = memory();
		bad.data.set('riverbanks:watermark', '{nope');
		expect(readWatermark(bad)).toEqual(off);
		const odd = memory();
		odd.data.set('riverbanks:watermark', JSON.stringify({ on: 'yes', text: 4 }));
		expect(readWatermark(odd)).toEqual(off);
		const throwing: WatermarkStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		expect(readWatermark(throwing)).toEqual(off);
		expect(() => writeWatermark(throwing, off)).not.toThrow();
		expect(readWatermark(undefined)).toEqual(off);
	});
});

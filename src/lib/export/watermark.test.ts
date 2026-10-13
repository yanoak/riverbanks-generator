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
		expect(watermarkLayout(1000, 1416, ' ', 'edge')).toBeNull();
	});

	it('is diagonal unless told otherwise', () => {
		expect(watermarkLayout(1000, 1416, 'PREVIEW')).toEqual(
			watermarkLayout(1000, 1416, 'PREVIEW', 'diagonal')
		);
	});
});

describe('watermarkLayout, edge style', () => {
	it('runs small and tracked down the right margin, centred on the page height', () => {
		const edge = watermarkLayout(1000, 1416, 'PREVIEW', 'edge')!;
		expect(edge.angle).toBe(90);
		expect(edge.y).toBe(708);
		expect(edge.x).toBeGreaterThan(970);
		expect(edge.x).toBeLessThan(1000);
		expect(edge.fontSize).toBeLessThanOrEqual(1000 * 0.018);
		expect(edge.letterSpacing).toBeGreaterThan(0);
	});

	it('shrinks long text to stay within the middle of the margin', () => {
		const long = 'PREVIEW COPY — RIVERBANKS — SEAPUNK STUDIOS — NOT FOR SALE';
		const edge = watermarkLayout(1000, 1416, long, 'edge')!;
		const length = long.length * edge.fontSize * (0.65 + edge.letterSpacing);
		expect(length).toBeLessThanOrEqual(1416 * 0.6 + 1e-6);
		expect(edge.fontSize).toBeLessThan(watermarkLayout(1000, 1416, 'PREVIEW', 'edge')!.fontSize);
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
		writeWatermark(storage, { on: true, text: 'DRAFT', style: 'diagonal' });
		expect(readWatermark(storage)).toEqual({ on: true, text: 'DRAFT', style: 'diagonal' });
	});

	it('reads a setting saved before styles existed, or with an unknown style, as edge', () => {
		const old = memory();
		old.data.set('riverbanks:watermark', JSON.stringify({ on: true, text: 'DRAFT' }));
		expect(readWatermark(old)).toEqual({ on: true, text: 'DRAFT', style: 'edge' });
		old.data.set('riverbanks:watermark', JSON.stringify({ on: true, text: 'X', style: 'tiled' }));
		expect(readWatermark(old)).toEqual({ on: true, text: 'X', style: 'edge' });
	});

	it('reads as off with PREVIEW when missing, malformed or unavailable', () => {
		const off = { on: false, text: 'PREVIEW', style: 'edge' } as const;
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

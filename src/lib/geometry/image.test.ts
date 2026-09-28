import { describe, expect, it } from 'vitest';
import { fitImage, panImage, zoomImage } from './image';

const box = { w: 400, h: 200 };
const natural = { naturalWidth: 1000, naturalHeight: 1000 };

describe('fitImage', () => {
	it('fill covers the box and centres the overflow', () => {
		const p = fitImage(natural, box, 'fill');
		expect(p.scale).toBe(0.4); // 1000 × 0.4 = 400 wide, 400 tall > 200
		expect(p.offsetX).toBe(0);
		expect(p.offsetY).toBe(-100);
	});

	it('fit contains the image and centres the letterbox', () => {
		const p = fitImage(natural, box, 'fit');
		expect(p.scale).toBe(0.2); // 200 × 200
		expect(p.offsetX).toBe(100);
		expect(p.offsetY).toBe(0);
	});
});

describe('zoomImage', () => {
	it('keeps the anchor point fixed on screen', () => {
		const start = { ...natural, scale: 0.4, offsetX: 0, offsetY: -100 };
		const anchor = { x: 200, y: 100 };
		// The image pixel under the anchor before…
		const px = (anchor.x - start.offsetX) / start.scale;
		const next = zoomImage(start, 2, anchor);
		expect(next.scale).toBe(0.8);
		// …is still under it after.
		expect(next.offsetX + px * next.scale).toBeCloseTo(anchor.x);
		expect(next.offsetY + ((anchor.y - start.offsetY) / start.scale) * next.scale).toBeCloseTo(
			anchor.y
		);
	});

	it('clamps the scale', () => {
		const start = { ...natural, scale: 0.4, offsetX: 0, offsetY: 0 };
		expect(zoomImage(start, 1000, { x: 0, y: 0 }).scale).toBe(20);
		expect(zoomImage(start, 0.00001, { x: 0, y: 0 }).scale).toBe(0.01);
	});
});

describe('panImage', () => {
	it('moves the offsets', () => {
		const start = { ...natural, scale: 1, offsetX: 5, offsetY: 5 };
		expect(panImage(start, { dx: 10, dy: -5 })).toMatchObject({ offsetX: 15, offsetY: 0 });
	});
});

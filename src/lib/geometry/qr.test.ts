import { describe, expect, it } from 'vitest';
import { qrMatrix, qrPath } from './qr';

describe('qrMatrix', () => {
	it('is an odd square of at least 21 modules with the three finder patterns', () => {
		const m = qrMatrix('https://riverbanks.lol');
		const n = m.length;
		expect(n).toBeGreaterThanOrEqual(21);
		expect(n % 2).toBe(1);
		expect(m.every((row) => row.length === n)).toBe(true);
		// Each finder: a dark 7×7 ring around a light ring around a dark 3×3 core.
		for (const [r, c] of [
			[0, 0],
			[0, n - 7],
			[n - 7, 0]
		]) {
			expect(m[r][c]).toBe(true);
			expect(m[r + 6][c + 6]).toBe(true);
			expect(m[r + 1][c + 1]).toBe(false);
			expect(m[r + 3][c + 3]).toBe(true);
		}
	});

	it('draws one path with a unit square per dark module', () => {
		const m = qrMatrix('x');
		const dark = m.flat().filter(Boolean).length;
		expect(qrPath(m).match(/M/g)).toHaveLength(dark);
	});
});

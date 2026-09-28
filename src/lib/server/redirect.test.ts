import { describe, expect, it } from 'vitest';
import { safeNext } from './redirect';

describe('safeNext', () => {
	it('keeps same-site paths and rejects everything else', () => {
		expect(safeNext('/comics/abc?page=2')).toBe('/comics/abc?page=2');
		expect(safeNext('//evil.test')).toBe('/comics');
		expect(safeNext('/\\evil.test')).toBe('/comics');
		expect(safeNext('https://evil.test')).toBe('/comics');
		expect(safeNext(null, '/x')).toBe('/x');
	});
});

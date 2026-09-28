import { describe, expect, it } from 'vitest';
import { slug } from './png';

describe('slug', () => {
	it('makes a filename-safe slug', () => {
		expect(slug('Riverbanks: Issue #1!')).toBe('riverbanks-issue-1');
		expect(slug('   ')).toBe('comic');
	});
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, MODELS, availableModels, modelFor } from './models';

describe('model registry', () => {
	it('every model has a unique key, at least one aspect, and a sane reference cap', () => {
		expect(new Set(MODELS.map((m) => m.key)).size).toBe(MODELS.length);
		for (const m of MODELS) {
			expect(m.aspects.length, m.key).toBeGreaterThan(0);
			for (const a of m.aspects) expect(a, m.key).toMatch(/^\d+:\d+$/);
			expect(m.maxRefs, m.key).toBeGreaterThanOrEqual(0);
		}
	});

	it('the default is a Gemini model', () => {
		expect(modelFor(DEFAULT_MODEL)?.provider).toBe('gemini');
	});

	it('lists only models whose provider is configured', () => {
		expect(availableModels(new Set(['gemini'])).every((m) => m.provider === 'gemini')).toBe(true);
		expect(availableModels(new Set())).toEqual([]);
	});

	it('an unknown key finds nothing', () => {
		expect(modelFor('nope')).toBeUndefined();
	});
});

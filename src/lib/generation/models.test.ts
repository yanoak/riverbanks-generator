import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, MODELS, PRINT_MODEL, availableModels, modelFor } from './models';

describe('model registry', () => {
	it('every model has a unique key, at least one aspect, and a sane reference cap', () => {
		expect(new Set(MODELS.map((m) => m.key)).size).toBe(MODELS.length);
		for (const m of MODELS) {
			expect(m.aspects.length, m.key).toBeGreaterThan(0);
			for (const a of m.aspects) expect(a, m.key).toMatch(/^\d+:\d+$/);
			expect(m.maxRefs, m.key).toBeGreaterThanOrEqual(0);
		}
	});

	it('every model has a draft size and a print size', () => {
		for (const m of MODELS) {
			expect(m.sizes.draft, m.key).toBeTruthy();
			expect(m.sizes.print, m.key).toBeTruthy();
		}
		expect(modelFor('gemini-flash')!.sizes).toEqual({ draft: '512', print: '4K' });
	});

	it('the print model is Nano Banana 2, which makes 4K', () => {
		expect(modelFor(PRINT_MODEL)).toMatchObject({
			provider: 'gemini',
			id: 'gemini-3.1-flash-image'
		});
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

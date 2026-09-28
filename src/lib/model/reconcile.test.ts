import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';

describe('reconcile', () => {
	it('makes the target deep-equal the source', () => {
		const target = { a: 1, b: { c: 2, gone: true }, list: [1, 2, 3] };
		const source = { a: 5, b: { c: 2 }, list: [3], added: 'x' };
		reconcile(target, source);
		expect(target).toEqual(source);
	});

	it('keeps object identity for items matched by id, even when reordered', () => {
		const one = { id: '1', x: 0 };
		const two = { id: '2', x: 0 };
		const target = { items: [one, two] };
		reconcile(target, {
			items: [
				{ id: '2', x: 0 },
				{ id: '1', x: 9 }
			]
		});
		expect(target.items[0]).toBe(two);
		expect(target.items[1]).toBe(one);
		expect(one.x).toBe(9);
	});

	it('leaves unchanged objects untouched and drops removed ids', () => {
		const keep = { id: 'k', nested: { deep: [1] } };
		const nested = keep.nested;
		const target = { items: [keep, { id: 'drop' }] };
		reconcile(target, { items: [{ id: 'k', nested: { deep: [1] } }] });
		expect(target.items).toEqual([keep]);
		expect(keep.nested).toBe(nested);
	});

	it('removes keys the source does not have', () => {
		const target: Record<string, unknown> = { tail: { x: 1 }, image: undefined, a: 1 };
		reconcile(target, { a: 1 });
		expect(Object.keys(target)).toEqual(['a']);
	});

	it('replaces a value whose type changed', () => {
		const target: Record<string, unknown> = { v: { x: 1 }, w: [1], n: null };
		reconcile(target, { v: 3, w: { a: 1 }, n: { b: 2 } });
		expect(target).toEqual({ v: 3, w: { a: 1 }, n: { b: 2 } });
	});
});

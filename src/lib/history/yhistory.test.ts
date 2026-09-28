import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { YHistory } from './yhistory.svelte';

const LOCAL = 'local';
const TYPING = 'typing';

function setup() {
	const doc = new Y.Doc();
	const root = doc.getMap('comic');
	const history = new YHistory();
	history.attach(root, { local: LOCAL, other: [TYPING] });
	const step = (description: string, fn: () => void) => {
		history.begin(description);
		doc.transact(fn, LOCAL);
		history.end();
	};
	return { doc, root, history, step };
}

describe('YHistory', () => {
	it('undoes and redoes described steps in order', () => {
		const { root, history, step } = setup();
		step('Set a', () => root.set('a', 1));
		step('Set b', () => root.set('b', 2));
		expect(history.undoCount).toBe(2);
		expect(history.lastCommandDescription).toBe('Set b');
		history.undo();
		expect(root.get('b')).toBeUndefined();
		expect(history.lastCommandDescription).toBe('Set a');
		expect(history.nextRedoDescription).toBe('Set b');
		history.redo();
		expect(root.get('b')).toBe(2);
	});

	it('keeps back-to-back steps separate', () => {
		const { root, history, step } = setup();
		step('One', () => root.set('x', 1));
		step('Two', () => root.set('x', 2));
		history.undo();
		expect(root.get('x')).toBe(1);
	});

	it("never undoes a collaborator's change", () => {
		const { doc, root, history, step } = setup();
		step('Mine', () => root.set('mine', 1));
		doc.transact(() => root.set('theirs', 1), 'remote');
		history.undo();
		expect(root.get('mine')).toBeUndefined();
		expect(root.get('theirs')).toBe(1);
		expect(history.canUndo).toBe(false);
	});

	it('records text-editor transactions as "Edit text", grouped while typing', () => {
		const { doc, root, history, step } = setup();
		doc.transact(() => root.set('t', 'a'), TYPING);
		doc.transact(() => root.set('t', 'ab'), TYPING);
		expect(history.undoCount).toBe(1);
		expect(history.lastCommandDescription).toBe('Edit text');
		// A command right after typing is its own step.
		step('Nudge', () => root.set('x', 1));
		expect(history.undoCount).toBe(2);
		history.undo();
		history.undo();
		expect(root.get('t')).toBeUndefined();
	});

	it('a grouped change joins the step in progress', () => {
		const { doc, root, history } = setup();
		doc.transact(() => root.set('t', 'a'), TYPING);
		history.begin('Grow', { group: true });
		doc.transact(() => root.set('h', 10), LOCAL);
		history.end({ group: true });
		expect(history.undoCount).toBe(1);
		history.undo();
		expect(root.get('h')).toBeUndefined();
		expect(root.get('t')).toBeUndefined();
	});

	it('clear() empties both stacks; attach() to a new doc starts fresh', () => {
		const { root, history, step } = setup();
		step('A', () => root.set('a', 1));
		history.undo();
		history.clear();
		expect([history.canUndo, history.canRedo]).toEqual([false, false]);
		const other = new Y.Doc().getMap('comic');
		history.attach(other, { local: LOCAL });
		expect(history.undoCount).toBe(0);
	});
});

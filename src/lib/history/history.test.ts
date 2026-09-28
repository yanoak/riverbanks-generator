import { describe, expect, it } from 'vitest';
import { HistoryManager, MAX_HISTORY_SIZE } from './history.svelte';
import { BatchCommand, type Command } from './command';

/** A command that appends/removes a token on a shared log, so order is observable. */
function logCommand(log: string[], token: string): Command {
	return {
		description: `push ${token}`,
		execute: () => log.push(token),
		undo: () => {
			const i = log.lastIndexOf(token);
			if (i >= 0) log.splice(i, 1);
		}
	};
}

describe('HistoryManager', () => {
	it('executes, undoes and redoes in order', () => {
		const log: string[] = [];
		const h = new HistoryManager();
		h.execute(logCommand(log, 'a'));
		h.execute(logCommand(log, 'b'));
		expect(log).toEqual(['a', 'b']);

		h.undo();
		expect(log).toEqual(['a']);
		expect(h.canRedo).toBe(true);
		expect(h.nextRedoDescription).toBe('push b');

		h.redo();
		expect(log).toEqual(['a', 'b']);
		expect(h.lastCommandDescription).toBe('push b');
	});

	it('clears the redo stack when a new command executes', () => {
		const log: string[] = [];
		const h = new HistoryManager();
		h.execute(logCommand(log, 'a'));
		h.undo();
		h.execute(logCommand(log, 'c'));
		expect(h.canRedo).toBe(false);
		expect(log).toEqual(['c']);
	});

	it('ignores undo/redo on empty stacks', () => {
		const h = new HistoryManager();
		h.undo();
		h.redo();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
	});

	it(`caps the undo stack at ${MAX_HISTORY_SIZE}`, () => {
		const log: string[] = [];
		const h = new HistoryManager();
		for (let i = 0; i < MAX_HISTORY_SIZE + 10; i++) h.execute(logCommand(log, String(i)));
		expect(h.undoCount).toBe(MAX_HISTORY_SIZE);
	});

	it('record() pushes an already-applied command without executing it', () => {
		const log: string[] = ['x'];
		const h = new HistoryManager();
		h.record(logCommand(log, 'x'));
		expect(log).toEqual(['x']);
		h.undo();
		expect(log).toEqual([]);
	});
});

describe('BatchCommand', () => {
	it('executes in order and undoes in reverse order', () => {
		const trace: string[] = [];
		const cmd = (n: string): Command => ({
			description: n,
			execute: () => trace.push(`do ${n}`),
			undo: () => trace.push(`undo ${n}`)
		});
		const batch = new BatchCommand('both', [cmd('1'), cmd('2')]);
		batch.execute();
		batch.undo();
		expect(trace).toEqual(['do 1', 'do 2', 'undo 2', 'undo 1']);
	});
});

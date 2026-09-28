import { describe, expect, it } from 'vitest';
import { InsertCommand, MoveCommand, RemoveCommand } from './list';

describe('list commands', () => {
	it('InsertCommand appends by default and undo removes the item', () => {
		const list = ['a', 'b'];
		const cmd = new InsertCommand('add', list, 'c');
		cmd.execute();
		expect(list).toEqual(['a', 'b', 'c']);
		cmd.undo();
		expect(list).toEqual(['a', 'b']);
	});

	it('RemoveCommand restores the item at its original index', () => {
		const list = ['a', 'b', 'c'];
		const cmd = new RemoveCommand('remove', list, 'b');
		cmd.execute();
		expect(list).toEqual(['a', 'c']);
		cmd.undo();
		expect(list).toEqual(['a', 'b', 'c']);
	});

	it('MoveCommand reorders and undo puts it back', () => {
		const list = ['a', 'b', 'c'];
		const cmd = new MoveCommand('move', list, 'a', 2);
		cmd.execute();
		expect(list).toEqual(['b', 'c', 'a']);
		cmd.undo();
		expect(list).toEqual(['a', 'b', 'c']);
	});
});

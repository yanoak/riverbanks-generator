import type { Command } from '$lib/history/command';

/** Inserts an item into an array (at the end by default); undo removes it. */
export class InsertCommand<T> implements Command {
	constructor(
		readonly description: string,
		private list: T[],
		private item: T,
		private index = list.length
	) {}

	execute(): void {
		this.list.splice(this.index, 0, this.item);
		// A $state array wraps what it stores in a proxy; keep that reference so undo's
		// indexOf finds it.
		this.item = this.list[this.index];
	}

	undo(): void {
		const i = this.list.indexOf(this.item);
		if (i >= 0) this.list.splice(i, 1);
	}
}

/** Removes an item from an array; undo puts it back at its original index. */
export class RemoveCommand<T> implements Command {
	private index = -1;

	constructor(
		readonly description: string,
		private list: T[],
		private item: T
	) {}

	execute(): void {
		this.index = this.list.indexOf(this.item);
		if (this.index >= 0) this.list.splice(this.index, 1);
	}

	undo(): void {
		if (this.index >= 0) this.list.splice(this.index, 0, this.item);
	}
}

/** Moves an item to a new index; undo moves it back. */
export class MoveCommand<T> implements Command {
	private from = -1;

	constructor(
		readonly description: string,
		private list: T[],
		private item: T,
		private to: number
	) {}

	execute(): void {
		this.from = this.list.indexOf(this.item);
		this.list.splice(this.from, 1);
		this.list.splice(this.to, 0, this.item);
	}

	undo(): void {
		this.list.splice(this.list.indexOf(this.item), 1);
		this.list.splice(this.from, 0, this.item);
	}
}

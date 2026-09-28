// Command pattern for undoable operations — ported from nadiio's canvas-tool-template
// (src/lib/stores/commands/types.ts @ f07f230). Every document mutation goes through one.

export interface Command {
	/** Apply the change. */
	execute(): void;
	/** Reverse the change. */
	undo(): void;
	/** Human-readable, e.g. "Merge panels", "Move balloon". */
	description: string;
}

/** Groups commands into one undo step; undoes in reverse order. */
export class BatchCommand implements Command {
	readonly description: string;
	private commands: Command[];

	constructor(description: string, commands: Command[]) {
		this.description = description;
		this.commands = commands;
	}

	execute(): void {
		for (const command of this.commands) command.execute();
	}

	undo(): void {
		for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].undo();
	}
}

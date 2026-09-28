// Undo/redo stack — ported from nadiio's canvas-tool-template
// (src/lib/stores/history.svelte.ts @ f07f230), plus record() for gestures such as drags
// that apply their change live and only become a command at pointer-up.

import type { Command } from './command';

export const MAX_HISTORY_SIZE = 50;

export class HistoryManager {
	private undoStack = $state<Command[]>([]);
	private redoStack = $state<Command[]>([]);

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	get undoCount(): number {
		return this.undoStack.length;
	}

	get redoCount(): number {
		return this.redoStack.length;
	}

	get lastCommandDescription(): string | null {
		return this.undoStack.at(-1)?.description ?? null;
	}

	get nextRedoDescription(): string | null {
		return this.redoStack.at(-1)?.description ?? null;
	}

	/** Execute a command and push it; a new action discards the redo branch. */
	execute(command: Command): void {
		command.execute();
		this.record(command);
	}

	/** Push a command whose effect has already been applied (e.g. a completed drag). */
	record(command: Command): void {
		this.undoStack = [...this.undoStack, command].slice(-MAX_HISTORY_SIZE);
		this.redoStack = [];
	}

	undo(): void {
		const command = this.undoStack.at(-1);
		if (!command) return;
		this.undoStack = this.undoStack.slice(0, -1);
		command.undo();
		this.redoStack = [...this.redoStack, command];
	}

	redo(): void {
		const command = this.redoStack.at(-1);
		if (!command) return;
		this.redoStack = this.redoStack.slice(0, -1);
		command.execute();
		this.undoStack = [...this.undoStack, command];
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}
}

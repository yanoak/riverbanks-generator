// Undo/redo over the comic's Y.Doc. A Y.UndoManager tracks only this client's own origins, so
// undo never reverts a collaborator's edit. Each editor command is one step (begin/end stop
// capture on both sides); the text editor's transactions group while typing, as TipTap's own
// history did. Exposes the reactive surface the toolbar reads.

import * as Y from 'yjs';

export const MAX_HISTORY_SIZE = 50;
const TEXT = 'Edit text';

export class YHistory {
	undoCount = $state(0);
	redoCount = $state(0);
	lastCommandDescription = $state<string | null>(null);
	nextRedoDescription = $state<string | null>(null);

	private um: Y.UndoManager | null = null;
	private local: unknown = null;
	private pending: string | null = null;
	private carry: string | null = null;

	get canUndo(): boolean {
		return this.undoCount > 0;
	}

	get canRedo(): boolean {
		return this.redoCount > 0;
	}

	/** Track changes to `scope` made with `local` (commands) or any of `other` (text editing). */
	attach(scope: Y.Map<unknown>, origins: { local: unknown; other?: unknown[] }): void {
		this.um?.destroy();
		this.local = origins.local;
		const um = new Y.UndoManager(scope, {
			// Yjs's own option, not UI state.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			trackedOrigins: new Set([origins.local, ...(origins.other ?? [])]),
			captureTimeout: 500
		});
		um.on('stack-item-added', ({ stackItem, origin }) => {
			// Undo/redo push a fresh item onto the opposite stack: carry the description over.
			const description = this.carry ?? (origin === this.local ? (this.pending ?? '') : TEXT);
			if (!stackItem.meta.has('description')) stackItem.meta.set('description', description);
			while (um.undoStack.length > MAX_HISTORY_SIZE) um.undoStack.shift();
			this.refresh();
		});
		for (const event of ['stack-item-popped', 'stack-item-updated', 'stack-cleared'] as const) {
			um.on(event, () => this.refresh());
		}
		this.um = um;
		this.refresh();
	}

	/** Before a command's transaction. `group` joins the step in progress (e.g. auto-grow). */
	begin(description: string, opts: { group?: boolean } = {}): void {
		if (!opts.group) this.um?.stopCapturing();
		this.pending = description;
	}

	/** After it: the next change starts a new step. */
	end(opts: { group?: boolean } = {}): void {
		if (!opts.group) this.um?.stopCapturing();
		this.pending = null;
	}

	undo(): void {
		this.carry = this.lastCommandDescription;
		this.um?.undo();
		this.carry = null;
	}

	redo(): void {
		this.carry = this.nextRedoDescription;
		this.um?.redo();
		this.carry = null;
	}

	clear(): void {
		this.um?.clear();
		this.refresh();
	}

	private refresh(): void {
		const um = this.um;
		const describe = (item: { meta: Map<unknown, unknown> } | undefined) =>
			item ? ((item.meta.get('description') as string) ?? null) : null;
		this.undoCount = um?.undoStack.length ?? 0;
		this.redoCount = um?.redoStack.length ?? 0;
		this.lastCommandDescription = describe(um?.undoStack.at(-1));
		this.nextRedoDescription = describe(um?.redoStack.at(-1));
	}
}

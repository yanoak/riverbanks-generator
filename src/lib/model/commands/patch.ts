import type { Command } from '$lib/history/command';

type Snapshot<T> = { [K in keyof T]?: T[K] };

/**
 * Sets some fields on an object; undo puts back exactly what was there (deleting keys that
 * did not exist). Used for moves, resizes, style edits and image placement.
 */
export class PatchCommand<T extends object> implements Command {
	private before: Snapshot<T>;
	private missing: (keyof T)[];

	constructor(
		readonly description: string,
		private target: T,
		private after: Snapshot<T>,
		before?: Snapshot<T>
	) {
		const keys = Object.keys(after) as (keyof T)[];
		this.before = before ?? (Object.fromEntries(keys.map((k) => [k, target[k]])) as Snapshot<T>);
		this.missing = before ? [] : keys.filter((k) => !(k in target));
	}

	/**
	 * For gestures that mutated the target live (drags, resizes): given the values at the
	 * start of the gesture, returns a command whose execute() re-applies the current values —
	 * or null if nothing actually changed.
	 */
	static fromChange<T extends object>(
		description: string,
		target: T,
		before: Snapshot<T>
	): PatchCommand<T> | null {
		const keys = Object.keys(before) as (keyof T)[];
		const changed = keys.some((k) => !Object.is(target[k], before[k]));
		if (!changed) return null;
		const after = Object.fromEntries(keys.map((k) => [k, target[k]])) as Snapshot<T>;
		return new PatchCommand(description, target, after, before);
	}

	execute(): void {
		Object.assign(this.target, this.after);
	}

	undo(): void {
		Object.assign(this.target, this.before);
		for (const k of this.missing) delete this.target[k];
	}
}

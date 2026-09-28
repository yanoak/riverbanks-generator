import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoSave, type SaveStatus } from './autosave';

function setup(saveImpl?: (json: string) => Promise<void>) {
	const doc = { version: 1, text: 'a' };
	const saved: string[] = [];
	const statuses: SaveStatus[] = [];
	const save = vi.fn(saveImpl ?? (async (json: string) => void saved.push(json)));
	const autosave = createAutoSave({
		getVersion: () => doc.version,
		serialize: () => doc.text,
		save,
		debounceMs: 500,
		retryDelayMs: 100,
		onStatus: (s) => statuses.push(s)
	});
	const edit = (text: string) => {
		doc.text = text;
		doc.version++;
		autosave.schedule();
	};
	return { doc, saved, statuses, save, autosave, edit };
}

describe('createAutoSave', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('debounces a burst of edits into one save of the latest state', async () => {
		const { saved, edit, statuses } = setup();
		edit('b');
		edit('c');
		edit('d');
		expect(statuses.at(-1)).toBe('dirty');
		await vi.advanceTimersByTimeAsync(499);
		expect(saved).toEqual([]);
		await vi.advanceTimersByTimeAsync(1);
		expect(saved).toEqual(['d']);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('queues a follow-up when an edit lands during a save, and stays dirty until it runs', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const writes: string[] = [];
		const { edit, statuses } = setup(async (json) => {
			writes.push(json);
			if (writes.length === 1) await gate;
		});
		edit('first');
		await vi.advanceTimersByTimeAsync(500); // save #1 starts and blocks
		edit('second'); // lands mid-save
		release();
		await vi.advanceTimersByTimeAsync(0);
		expect(statuses.at(-1)).toBe('dirty'); // version moved during the save
		await vi.advanceTimersByTimeAsync(500);
		expect(writes).toEqual(['first', 'second']);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('retries failures, then reports an error', async () => {
		const { edit, statuses, save } = setup(async () => {
			throw new Error('quota');
		});
		edit('x');
		await vi.advanceTimersByTimeAsync(500 + 100 * 3);
		expect(save).toHaveBeenCalledTimes(4); // first try + 3 retries
		expect(statuses.at(-1)).toBe('error');
	});

	it('saveNow skips the debounce', async () => {
		const { saved, edit, autosave } = setup();
		edit('now');
		await autosave.saveNow();
		expect(saved).toEqual(['now']);
	});

	it('does nothing when already saved', async () => {
		const { save, autosave } = setup();
		autosave.markSaved();
		await autosave.saveNow();
		expect(save).not.toHaveBeenCalled();
	});
});

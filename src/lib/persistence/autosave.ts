// Debounced autosave — the in-flight and follow-up logic is ported from nadiio's
// canvas-tool-template (src/lib/stores/persistence.ts @ f07f230), with the Supabase write
// replaced by an injected save() so any store (IndexedDB now, a server later) plugs in.

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** Thrown by save() when someone else wrote first; autosave pauses until resume(). */
export class ConflictError extends Error {
	constructor() {
		super('The document was changed elsewhere.');
	}
}

export interface AutoSaveOptions {
	/** Monotonic document version; bumped on every change. */
	getVersion: () => number;
	serialize: () => string;
	save: (json: string) => Promise<void>;
	debounceMs?: number;
	maxRetries?: number;
	retryDelayMs?: number;
	onStatus?: (status: SaveStatus) => void;
}

export function createAutoSave({
	getVersion,
	serialize,
	save,
	debounceMs = 800,
	maxRetries = 3,
	retryDelayMs = 1000,
	onStatus
}: AutoSaveOptions) {
	let savedVersion = -1;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inflight: Promise<void> | null = null;
	let pending = false;
	let conflicted = false;

	const status = (s: SaveStatus) => onStatus?.(s);
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function write(): Promise<void> {
		const version = getVersion();
		if (version === savedVersion || conflicted) return;
		status('saving');
		const json = serialize();
		for (let attempt = 0; ; attempt++) {
			try {
				await save(json);
				savedVersion = version;
				// Only clean if nothing changed while the write was in flight.
				status(getVersion() === version ? 'saved' : 'dirty');
				return;
			} catch (e) {
				if (e instanceof ConflictError) {
					conflicted = true;
					status('conflict');
					return;
				}
				if (attempt >= maxRetries) {
					console.error('Autosave failed', e);
					status('error');
					return;
				}
				await sleep(retryDelayMs);
			}
		}
	}

	function flush(): Promise<void> {
		timer = null;
		if (inflight) {
			pending = true;
			return inflight;
		}
		inflight = write().finally(() => {
			inflight = null;
			if (pending) {
				pending = false;
				schedule();
			}
		});
		return inflight;
	}

	/** Call after every change. */
	function schedule(): void {
		if (conflicted) return;
		if (getVersion() !== savedVersion) status('dirty');
		if (inflight) {
			pending = true;
			return;
		}
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, debounceMs);
	}

	/** Save immediately (e.g. when the tab is hidden), waiting out any write in flight. */
	async function saveNow(): Promise<void> {
		if (timer) clearTimeout(timer);
		timer = null;
		if (inflight) await inflight;
		await flush();
	}

	/** The current version is already persisted (e.g. just loaded). */
	function markSaved(): void {
		savedVersion = getVersion();
		status('saved');
	}

	/** After the conflict is resolved (reloaded, or chosen to overwrite): save again. */
	function resume(): void {
		conflicted = false;
		schedule();
	}

	function cancel(): void {
		if (timer) clearTimeout(timer);
		timer = null;
		pending = false;
	}

	return { schedule, saveNow, markSaved, resume, cancel };
}

export type AutoSave = ReturnType<typeof createAutoSave>;

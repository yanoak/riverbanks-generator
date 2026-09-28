// Editor state: the comic document, selection, mode and history. Components read from it;
// every document change goes through run() or record(), so undo, redo and autosave all see it.

import { HistoryManager } from '$lib/history/history.svelte';
import { BatchCommand, type Command } from '$lib/history/command';
import { InsertCommand, RemoveCommand } from '$lib/model/commands/list';
import {
	createFreePanel,
	MergePanelsCommand,
	SetGridCommand,
	splashCommand,
	SplitPanelCommand
} from '$lib/model/commands/panels';
import { PatchCommand } from '$lib/model/commands/patch';
import { createComic } from '$lib/model/factory';
import type { Comic, FreePanel, GridSpec, Page, Panel, Rect } from '$lib/model/types';

export type Selection =
	{ kind: 'none' } | { kind: 'panels'; ids: string[] } | { kind: 'balloon'; id: string };

export type Mode = 'select' | 'image' | 'text';

const REASONS: Record<string, string> = {
	'need-two': 'Select at least two panels to merge (⇧-click or ⇧+arrow).',
	'not-contiguous': 'Panels must share an edge to merge.',
	'has-hole': 'That merge would enclose a gap — merge the gap too, or use a free panel.',
	'has-merges': 'Split merged panels before changing rows or columns.',
	invalid: 'Rows and columns must be at least 1.'
};

export class Editor {
	comic = $state<Comic>(createComic());
	pageIndex = $state(0);
	selection = $state<Selection>({ kind: 'none' });
	mode = $state<Mode>('select');
	/** null = fit the page to the viewport. */
	zoom = $state<number | null>(null);
	/** Bumped on every document change; autosave watches it. */
	version = $state(0);
	status = $state<string | null>(null);
	readonly history = new HistoryManager();

	get page(): Page {
		return this.comic.pages[this.pageIndex];
	}

	get selectedPanels(): Panel[] {
		const sel = this.selection;
		if (sel.kind !== 'panels') return [];
		return sel.ids.map((id) => this.page.panels.find((p) => p.id === id)).filter((p) => !!p);
	}

	run(command: Command): void {
		this.history.execute(command);
		this.changed();
	}

	/** For gestures that already applied their change live (drags). */
	record(command: Command | null): void {
		if (!command) return;
		this.history.record(command);
		this.changed();
	}

	undo(): void {
		this.history.undo();
		this.pruneSelection();
		this.changed();
	}

	redo(): void {
		this.history.redo();
		this.pruneSelection();
		this.changed();
	}

	/** Mark the document changed without a history entry (e.g. renaming the comic). */
	changed(): void {
		this.version++;
	}

	say(message: string | null): void {
		this.status = message;
	}

	// --- selection ------------------------------------------------------------------------

	select(selection: Selection): void {
		this.selection = selection;
		this.status = null;
		if (selection.kind === 'none') this.mode = 'select';
	}

	selectPanel(id: string, extend = false): void {
		const current = this.selection.kind === 'panels' ? this.selection.ids : [];
		if (!extend) return this.select({ kind: 'panels', ids: [id] });
		const ids = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
		this.select(ids.length ? { kind: 'panels', ids } : { kind: 'none' });
	}

	/** Drop selected ids that no longer exist (after undo, delete, page switch). */
	private pruneSelection(): void {
		const sel = this.selection;
		if (sel.kind === 'panels') {
			const ids = sel.ids.filter((id) => this.page.panels.some((p) => p.id === id));
			this.selection = ids.length ? { kind: 'panels', ids } : { kind: 'none' };
		} else if (sel.kind === 'balloon' && !this.page.balloons.some((b) => b.id === sel.id)) {
			this.selection = { kind: 'none' };
		}
	}

	// --- panel operations -----------------------------------------------------------------

	merge(): void {
		const ids = this.selection.kind === 'panels' ? this.selection.ids : [];
		const result = MergePanelsCommand.create(this.page, ids);
		if (!result.ok) return this.say(REASONS[result.reason]);
		this.run(result.command);
		this.select({ kind: 'panels', ids: [result.mergedId] });
	}

	split(): void {
		const [panel] = this.selectedPanels;
		if (!panel || panel.kind !== 'grid' || panel.cells.length < 2) {
			return this.say('Select a merged panel to split.');
		}
		this.run(new SplitPanelCommand(this.page, panel.id));
		this.select({ kind: 'panels', ids: [panel.id] });
	}

	setGrid(spec: Partial<GridSpec>): void {
		const result = SetGridCommand.create(this.page, spec);
		if (!result.ok) return this.say(REASONS[result.reason]);
		this.run(result.command);
		this.pruneSelection();
	}

	addFreePanel(): string {
		const panel = createFreePanel(this.page);
		this.run(new InsertCommand('Add free panel', this.page.panels, panel));
		this.select({ kind: 'panels', ids: [panel.id] });
		return panel.id;
	}

	splash(): void {
		this.run(splashCommand(this.page));
		this.pruneSelection();
	}

	/** Record a completed drag or resize of a free panel or balloon. */
	commitGeometry(target: Rect, before: Rect, description: string): void {
		this.record(PatchCommand.fromChange(description, target, before));
	}

	/** The single selected free panel (or later, balloon) that arrows and z-order act on. */
	get movable(): (Rect & { z: number }) | undefined {
		const [panel] = this.selectedPanels;
		return this.selectedPanels.length === 1 && panel.kind === 'free' ? panel : undefined;
	}

	nudge(dx: number, dy: number): boolean {
		const target = this.movable;
		if (!target) return false;
		this.run(new PatchCommand('Nudge', target, { x: target.x + dx, y: target.y + dy }));
		return true;
	}

	reorder(to: 'front' | 'back'): void {
		const target = this.movable;
		if (!target) return;
		const zs = this.page.panels.filter((p): p is FreePanel => p.kind === 'free').map((p) => p.z);
		const z = to === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
		this.run(new PatchCommand(to === 'front' ? 'Bring to front' : 'Send to back', target, { z }));
	}

	deleteSelection(): void {
		const free = this.selectedPanels.filter((p) => p.kind === 'free');
		if (!free.length) return;
		this.run(
			new BatchCommand(
				'Delete panel',
				free.map((p) => new RemoveCommand('Delete panel', this.page.panels, p))
			)
		);
		this.select({ kind: 'none' });
	}

	// --- pages & view ---------------------------------------------------------------------

	goToPage(index: number): void {
		if (index < 0 || index >= this.comic.pages.length) return;
		this.pageIndex = index;
		this.select({ kind: 'none' });
	}

	zoomBy(factor: number, fit: number): void {
		const current = this.zoom ?? fit;
		this.zoom = Math.min(4, Math.max(0.1, current * factor));
	}
}

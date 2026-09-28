import { canMerge } from '$lib/geometry/grid';
import type { Command } from '$lib/history/command';
import { clone } from '../clone';
import { newId, singleCellPanels } from '../factory';
import { gridPanels } from '../invariants';
import type { GridPanel, GridSpec, Page, Panel } from '../types';

/** Swaps the page's whole panel list; the shared base of the partition-changing commands. */
abstract class ReplacePanelsCommand implements Command {
	abstract readonly description: string;
	protected before: Panel[] = [];
	protected after: Panel[] = [];

	constructor(protected page: Page) {}

	execute(): void {
		this.page.panels = this.after;
	}

	undo(): void {
		this.page.panels = this.before;
	}
}

type Rejected<R extends string> = { ok: false; reason: R };

export class MergePanelsCommand extends ReplacePanelsCommand {
	readonly description = 'Merge panels';

	/**
	 * Validates before constructing, so the UI can explain a refusal instead of throwing.
	 * The merged panel keeps the first selected panel's id and style, and the image of the
	 * first selected panel that has one.
	 */
	static create(
		page: Page,
		panelIds: string[]
	):
		| { ok: true; command: MergePanelsCommand; mergedId: string }
		| Rejected<'need-two' | 'not-contiguous' | 'has-hole'> {
		const byId = new Map(gridPanels(page).map((p) => [p.id, p]));
		const selected = [...new Set(panelIds)].map((id) => byId.get(id)).filter((p) => !!p);
		if (selected.length < 2) return { ok: false, reason: 'need-two' };

		const cells = selected.flatMap((p) => p.cells).sort((a, b) => a - b);
		const check = canMerge(cells, page.grid);
		if (!check.ok) return check;

		const first = selected[0];
		const merged: GridPanel = {
			...clone(first),
			cells,
			image: clone(selected.find((p) => p.image)?.image)
		};
		if (!merged.image) delete merged.image;

		const command = new MergePanelsCommand(page);
		const drop = new Set(selected.map((p) => p.id));
		command.before = page.panels;
		command.after = page.panels.flatMap((p) =>
			p.id === first.id ? [merged] : drop.has(p.id) ? [] : [p]
		);
		return { ok: true, command, mergedId: first.id };
	}
}

export class SplitPanelCommand extends ReplacePanelsCommand {
	readonly description = 'Split panel';

	constructor(page: Page, panelId: string) {
		super(page);
		this.before = page.panels;
		this.after = page.panels.flatMap((p) => {
			if (p.id !== panelId || p.kind !== 'grid') return [p];
			const [first, ...rest] = [...p.cells].sort((a, b) => a - b);
			const { image, ...style } = clone(p);
			return [
				{ ...style, cells: [first], ...(image ? { image } : {}) },
				...rest.map((cell) => ({ ...style, id: newId(), cells: [cell] }))
			];
		});
	}
}

export class SetGridCommand implements Command {
	readonly description = 'Change grid';
	private beforeGrid: GridSpec;
	private afterGrid: GridSpec;
	private beforePanels: Panel[];
	private afterPanels: Panel[];

	private constructor(
		private page: Page,
		spec: Partial<GridSpec>
	) {
		this.beforeGrid = { ...page.grid };
		this.afterGrid = { ...page.grid, ...spec };
		this.beforePanels = page.panels;
		const reshaped =
			this.afterGrid.rows !== this.beforeGrid.rows || this.afterGrid.cols !== this.beforeGrid.cols;
		if (!reshaped) {
			this.afterPanels = page.panels;
			return;
		}
		// Keep the panel (and its image) wherever the same row/col still exists.
		const old = new Map(
			gridPanels(page).map((p) => {
				const c = p.cells[0];
				return [`${Math.floor(c / this.beforeGrid.cols)},${c % this.beforeGrid.cols}`, p];
			})
		);
		const fresh = singleCellPanels(this.afterGrid).map((p) => {
			const c = p.cells[0];
			const kept = old.get(`${Math.floor(c / this.afterGrid.cols)},${c % this.afterGrid.cols}`);
			return kept ? { ...kept, cells: [c] } : p;
		});
		this.afterPanels = [...fresh, ...page.panels.filter((p) => p.kind === 'free')];
	}

	/** Rows/cols can only change while every grid panel is a single cell. */
	static create(
		page: Page,
		spec: Partial<GridSpec>
	): { ok: true; command: SetGridCommand } | Rejected<'has-merges' | 'invalid'> {
		const next = { ...page.grid, ...spec };
		if (next.rows < 1 || next.cols < 1 || next.gutter < 0 || next.margin < 0) {
			return { ok: false, reason: 'invalid' };
		}
		const reshaped = next.rows !== page.grid.rows || next.cols !== page.grid.cols;
		if (reshaped && gridPanels(page).some((p) => p.cells.length > 1)) {
			return { ok: false, reason: 'has-merges' };
		}
		return { ok: true, command: new SetGridCommand(page, spec) };
	}

	execute(): void {
		this.page.grid = { ...this.afterGrid };
		this.page.panels = this.afterPanels;
	}

	undo(): void {
		this.page.grid = { ...this.beforeGrid };
		this.page.panels = this.beforePanels;
	}
}

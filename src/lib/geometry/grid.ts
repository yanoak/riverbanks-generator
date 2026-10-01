// Panel geometry on the page grid. A grid panel is a set of cells; its outline is traced
// along the grid lattice and mapped to page coordinates, so internal gutters are absorbed
// and an L-shape comes out as one 6-vertex polygon.

import type { GridSpec, Point, Rect, Size } from '$lib/model/types';

/** Where the first row starts: below the header band, if any, and the margin. */
const gridTop = (grid: GridSpec) => (grid.top ?? 0) + grid.margin;

function cellSize(grid: GridSpec, size: Size) {
	const bands = (grid.top ?? 0) + (grid.bottom ?? 0);
	return {
		w: (size.width - 2 * grid.margin - (grid.cols - 1) * grid.gutter) / grid.cols,
		h: (size.height - bands - 2 * grid.margin - (grid.rows - 1) * grid.gutter) / grid.rows
	};
}

/** The part of the page the grid lays out in: all of it, less the header and footer bands. */
export function gridArea(grid: GridSpec, size: Size): Rect {
	const top = grid.top ?? 0;
	return { x: 0, y: top, w: size.width, h: size.height - top - (grid.bottom ?? 0) };
}

export function cellRect(grid: GridSpec, size: Size, cell: number): Rect {
	const { w, h } = cellSize(grid, size);
	const row = Math.floor(cell / grid.cols);
	const col = cell % grid.cols;
	return {
		x: grid.margin + col * (w + grid.gutter),
		y: gridTop(grid) + row * (h + grid.gutter),
		w,
		h
	};
}

/** Which cell contains a page-space point, or null if it falls in a margin or gutter. */
export function cellAt(grid: GridSpec, size: Size, p: Point): number | null {
	const { w, h } = cellSize(grid, size);
	const col = Math.floor((p.x - grid.margin) / (w + grid.gutter));
	const row = Math.floor((p.y - gridTop(grid)) / (h + grid.gutter));
	if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
	const r = cellRect(grid, size, row * grid.cols + col);
	if (p.x > r.x + r.w || p.y > r.y + r.h) return null;
	return row * grid.cols + col;
}

function neighbours(cell: number, grid: GridSpec): number[] {
	const row = Math.floor(cell / grid.cols);
	const col = cell % grid.cols;
	const out: number[] = [];
	if (row > 0) out.push(cell - grid.cols);
	if (row < grid.rows - 1) out.push(cell + grid.cols);
	if (col > 0) out.push(cell - 1);
	if (col < grid.cols - 1) out.push(cell + 1);
	return out;
}

/** Non-empty, in range, and 4-connected. */
export function isContiguous(cells: number[], grid: GridSpec): boolean {
	const total = grid.rows * grid.cols;
	const set = new Set(cells);
	if (set.size === 0 || [...set].some((c) => c < 0 || c >= total)) return false;
	const seen = new Set<number>();
	const stack = [cells[0]];
	while (stack.length) {
		const c = stack.pop()!;
		if (seen.has(c)) continue;
		seen.add(c);
		for (const n of neighbours(c, grid)) if (set.has(n) && !seen.has(n)) stack.push(n);
	}
	return seen.size === set.size;
}

/**
 * True if some cell outside the set cannot reach the page edge by 4-connected steps through
 * other outside cells — a ring, or a region pinched off at a corner. Such shapes have more
 * than one boundary loop, so they are not valid panels.
 */
export function hasHoles(cells: number[], grid: GridSpec): boolean {
	const set = new Set(cells);
	const total = grid.rows * grid.cols;
	const outside = [...Array(total).keys()].filter((c) => !set.has(c));
	const onEdge = (c: number) => {
		const row = Math.floor(c / grid.cols);
		const col = c % grid.cols;
		return row === 0 || col === 0 || row === grid.rows - 1 || col === grid.cols - 1;
	};
	const reached = new Set<number>();
	const stack = outside.filter(onEdge);
	while (stack.length) {
		const c = stack.pop()!;
		if (reached.has(c)) continue;
		reached.add(c);
		for (const n of neighbours(c, grid)) if (!set.has(n) && !reached.has(n)) stack.push(n);
	}
	return reached.size < outside.length;
}

export type MergeCheck = { ok: true } | { ok: false; reason: 'not-contiguous' | 'has-hole' };

export function canMerge(cells: number[], grid: GridSpec): MergeCheck {
	if (!isContiguous(cells, grid)) return { ok: false, reason: 'not-contiguous' };
	if (hasHoles(cells, grid)) return { ok: false, reason: 'has-hole' };
	return { ok: true };
}

/** A grid panel as derived from cell ownership; `source` names whose properties it takes. */
export interface DerivedPanel {
	id: string;
	cells: number[];
	/** The stored panel it copies style from; null for a cell nobody (valid) owns. */
	source: string | null;
	/** True when the id is synthetic: the stored document has no panel under it. */
	derived: boolean;
}

const cellKey = (cell: number, grid: GridSpec) =>
	`${Math.floor(cell / grid.cols)},${cell % grid.cols}`;

/** 4-connected components of a cell set, each sorted, ordered by first cell. */
function components(cells: number[], grid: GridSpec): number[][] {
	const set = new Set(cells);
	const seen = new Set<number>();
	const out: number[][] = [];
	for (const start of [...set].sort((a, b) => a - b)) {
		if (seen.has(start)) continue;
		const part: number[] = [];
		const stack = [start];
		while (stack.length) {
			const c = stack.pop()!;
			if (seen.has(c)) continue;
			seen.add(c);
			part.push(c);
			for (const n of neighbours(c, grid)) if (set.has(n) && !seen.has(n)) stack.push(n);
		}
		out.push(part.sort((a, b) => a - b));
	}
	return out;
}

/** Horizontal runs of consecutive cells within each row: always valid panels. */
function rowRuns(cells: number[], grid: GridSpec): number[][] {
	const runs: number[][] = [];
	for (const c of cells) {
		const run = runs.at(-1);
		const last = run?.at(-1);
		if (run && last === c - 1 && Math.floor(last / grid.cols) === Math.floor(c / grid.cols)) {
			run.push(c);
		} else runs.push([c]);
	}
	return runs;
}

/**
 * Grid panels from per-cell ownership, which concurrent edits can leave in any state: every
 * cell is covered exactly once by construction, and each owner's cells are cut into valid
 * panels. The piece holding the owner's first cell keeps its id; other pieces get ids derived
 * from their first cell (`<id>~row,col`), so every replica derives the same page, and two
 * replicas writing a derived panel back write the same key.
 */
export function derivePanels(
	grid: GridSpec,
	ownerOf: (cell: number) => string | undefined,
	exists: (id: string) => boolean
): DerivedPanel[] {
	const byOwner = new Map<string, number[]>();
	const out: DerivedPanel[] = [];
	for (let cell = 0; cell < grid.rows * grid.cols; cell++) {
		const owner = ownerOf(cell);
		if (owner === undefined || !exists(owner)) {
			out.push({ id: `~${cellKey(cell, grid)}`, cells: [cell], source: null, derived: true });
		} else byOwner.set(owner, [...(byOwner.get(owner) ?? []), cell]);
	}
	for (const [owner, cells] of byOwner) {
		const pieces = components(cells, grid).flatMap((part) =>
			hasHoles(part, grid) ? rowRuns(part, grid) : [part]
		);
		pieces.forEach((part, i) =>
			out.push({
				id: i === 0 ? owner : `${owner}~${cellKey(part[0], grid)}`,
				cells: part,
				source: owner,
				derived: i > 0
			})
		);
	}
	return out.sort((a, b) => a.cells[0] - b.cells[0]);
}

type LatticeEdge = { from: [number, number]; to: [number, number] };

/**
 * Clockwise (screen coordinates, y down) outline of a valid panel, starting at its top-left
 * vertex. Boundary edges are collected on the (cols+1) × (rows+1) lattice, chained into a
 * loop, reduced to corners, and each corner is placed on the real cell edge its adjoining
 * edges belong to — so a boundary between two cells of the panel never appears.
 */
export function panelOutline(cells: number[], grid: GridSpec, size: Size): Point[] {
	const set = new Set(cells);
	const has = (row: number, col: number) =>
		row >= 0 && col >= 0 && row < grid.rows && col < grid.cols && set.has(row * grid.cols + col);

	const edges = new Map<string, LatticeEdge>();
	const add = (from: [number, number], to: [number, number]) =>
		edges.set(from.join(','), { from, to });
	for (const cell of set) {
		const r = Math.floor(cell / grid.cols);
		const c = cell % grid.cols;
		// Lattice points are [col, row]. Each exposed side runs clockwise around the cell.
		if (!has(r - 1, c)) add([c, r], [c + 1, r]);
		if (!has(r, c + 1)) add([c + 1, r], [c + 1, r + 1]);
		if (!has(r + 1, c)) add([c + 1, r + 1], [c, r + 1]);
		if (!has(r, c - 1)) add([c, r + 1], [c, r]);
	}

	// Start at the top-left-most lattice point that begins an edge.
	const starts = [...edges.values()].map((e) => e.from);
	starts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
	const loop: LatticeEdge[] = [];
	let edge = edges.get(starts[0].join(','))!;
	while (loop.length <= edges.size) {
		loop.push(edge);
		edge = edges.get(edge.to.join(','))!;
		if (edge === loop[0]) break;
	}

	const { w, h } = cellSize(grid, size);
	const colLeft = (i: number) => grid.margin + i * (w + grid.gutter);
	const rowTop = (j: number) => gridTop(grid) + j * (h + grid.gutter);

	// Keep only corners: vertex i sits between loop[i-1] (incoming) and loop[i] (outgoing).
	const points: Point[] = [];
	for (let i = 0; i < loop.length; i++) {
		const incoming = loop[(i - 1 + loop.length) % loop.length];
		const outgoing = loop[i];
		const vertical = (e: LatticeEdge) => e.from[0] === e.to[0];
		if (vertical(incoming) === vertical(outgoing)) continue;
		const v = vertical(incoming) ? incoming : outgoing;
		const hz = vertical(incoming) ? outgoing : incoming;
		// Going down = the panel is on the left of this line (the right side of a cell).
		const x = v.to[1] > v.from[1] ? colLeft(v.from[0] - 1) + w : colLeft(v.from[0]);
		// Going right = the top side of a cell; going left = the bottom side.
		const y = hz.to[0] > hz.from[0] ? rowTop(hz.from[1]) : rowTop(hz.from[1] - 1) + h;
		points.push({ x, y });
	}
	return points;
}

export function polygonBBox(points: Point[]): Rect {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** CSS clip-path polygon relative to the polygon's own bbox. */
export function clipPathFor(points: Point[]): string {
	const b = polygonBBox(points);
	return `polygon(${points.map((p) => `${p.x - b.x}px ${p.y - b.y}px`).join(', ')})`;
}

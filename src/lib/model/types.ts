// The comic document. All geometry is in page units (see PAGE_SIZE in factory.ts);
// the editor scales the page for display, so nothing here depends on zoom.

export const DOC_VERSION = 1;

export type Id = string;

export interface Size {
	width: number;
	height: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Uniform rows × cols grid. Cell index = row * cols + col. */
export interface GridSpec {
	rows: number;
	cols: number;
	gutter: number;
	margin: number;
}

/** An image placed in a panel; offsets and scale position it relative to the panel's bbox. */
export interface PanelImage {
	assetId: Id;
	naturalWidth: number;
	naturalHeight: number;
	offsetX: number;
	offsetY: number;
	scale: number;
}

interface PanelBase {
	id: Id;
	border: 'solid' | 'none';
	fill: string;
	image?: PanelImage;
	/** What to generate for this panel; kept so anyone can tweak it and generate again. */
	prompt?: string;
}

/**
 * A panel made of grid cells. The grid panels of a page always partition every cell,
 * and each panel's cells are 4-connected with no holes (see geometry/grid.ts canMerge).
 */
export interface GridPanel extends PanelBase {
	kind: 'grid';
	cells: number[];
}

/** A break-out panel positioned freely above the grid panels. */
export interface FreePanel extends PanelBase, Rect {
	kind: 'free';
	z: number;
}

export type Panel = GridPanel | FreePanel;

export type BalloonType = 'caption' | 'speech' | 'thought' | 'whisper' | 'shout' | 'sfx';

/** Text on the page. Lives on the page, not in a panel, because balloons cross borders. */
export interface Balloon extends Rect {
	id: Id;
	type: BalloonType;
	z: number;
	/** Tail tip relative to the balloon's top-left, so the tail moves with the balloon. */
	tail?: Point;
	/** Rich text from the in-place editor (TipTap), rendered as-is. */
	html: string;
	font: string;
	fontSize: number;
	fill: string;
	stroke: string;
	clipTo?: Id;
}

export interface Page extends Size {
	id: Id;
	grid: GridSpec;
	panels: Panel[];
	balloons: Balloon[];
}

export interface Comic {
	id: Id;
	title: string;
	/** The style profile every generation in this comic follows (a live link, by id). */
	styleProfileId?: Id;
	pages: Page[];
	docVersion: number;
}

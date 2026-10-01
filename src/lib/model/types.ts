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
	/** Height of the header band above the grid (the A1 board's title strip); absent is 0. */
	top?: number;
	/** Height of the footer band below the grid; absent is 0. */
	bottom?: number;
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
	/**
	 * Which of the style's cast to attach, by id, when someone chose by hand. Absent means
	 * "whoever the prompt names" (generation/cast.ts).
	 */
	cast?: string[];
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
	/** A CSS font-family of the balloon's own; absent means its style's lettering for its type. */
	font?: string;
	fontSize: number;
	fill: string;
	stroke: string;
	/** Unused; see anchor. */
	clipTo?: Id;
	/** 0 (box) to 1 (ellipse) for speech, whisper and caption; absent is 1, or 0 for a caption. */
	roundness?: number;
	/** Bumps on a thought balloon, spikes on a shout; absent is the size-based / 18 default. */
	points?: number;
	/** How deep a shout's spikes cut, 0 to 1; absent is 0.55. */
	depth?: number;
	/** Sits in this panel corner, cut off flush by the panel's border (see model/balloons.ts). */
	anchor?: BalloonAnchor;
	/** The balloon this one connects to: the next line in the same exchange. */
	next?: Id;
	/** How the connection to `next` is drawn; absent is a neck. */
	connector?: 'neck' | 'line';
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface BalloonAnchor {
	panelId: Id;
	corner: Corner;
}

/** The header band's text: a large title line over a smaller subtitle. */
export interface HeaderText {
	title: string;
	subtitle: string;
}

export interface FooterText {
	left: string;
	center: string;
	right: string;
	/**
	 * An address for the QR code at the footer's right end (and its link); '' shows none. Absent
	 * in comics stored before it existed, which then show the house default.
	 */
	qr?: string;
}

/**
 * Text for the header and footer bands (see GridSpec top/bottom). Plain strings, where
 * {comic}, {page} and {pages} stand for the title, this page's number and the page count.
 */
export interface Bands {
	header: HeaderText;
	footer: FooterText;
}

/** One page's departures from its comic's bands; '' blanks a slot on this page. */
export interface BandOverrides {
	header?: Partial<HeaderText>;
	footer?: Partial<FooterText>;
}

export interface Page extends Size {
	id: Id;
	grid: GridSpec;
	panels: Panel[];
	balloons: Balloon[];
	bands?: BandOverrides;
}

export interface Comic {
	id: Id;
	title: string;
	/** The style profile every generation in this comic follows (a live link, by id). */
	styleProfileId?: Id;
	/** The header and footer every page shows unless it overrides them; absent is HOUSE_BANDS. */
	bands?: Bands;
	pages: Page[];
	docVersion: number;
}

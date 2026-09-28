import type { Page, Panel, Rect } from '$lib/model/types';
import { panelOutline, polygonBBox } from './grid';

/** The panel's bounding box in page units — what its image is positioned against. */
export function panelBox(page: Page, panel: Panel): Rect {
	if (panel.kind === 'free') return { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
	return polygonBBox(panelOutline(panel.cells, page.grid, page));
}

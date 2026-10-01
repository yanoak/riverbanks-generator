import type { Page, Panel, Point, Rect } from '$lib/model/types';
import { insidePolygon, panelOutline, polygonBBox } from './grid';

export { insidePolygon };

/** The panel's bounding box in page units — what its image is positioned against. */
export function panelBox(page: Page, panel: Panel): Rect {
	if (panel.kind === 'free') return { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
	return polygonBBox(panelOutline(panel.cells, page.grid, page));
}

/** The panel's outline: a grid panel's traced polygon, a free panel's rectangle. */
export function panelPolygon(page: Page, panel: Panel): Point[] {
	if (panel.kind === 'grid') return panelOutline(panel.cells, page.grid, page);
	const { x, y, w, h } = panel;
	return [
		{ x, y },
		{ x: x + w, y },
		{ x: x + w, y: y + h },
		{ x, y: y + h }
	];
}

/** The panel showing at a point (free panels sit on top), else the one whose box is nearest. */
export function panelNear(page: Page, p: Point): Panel | undefined {
	const order = [
		...page.panels
			.filter((x) => x.kind === 'free')
			.sort((a, b) => ('z' in b ? b.z : 0) - ('z' in a ? a.z : 0)),
		...page.panels.filter((x) => x.kind === 'grid')
	];
	const hit = order.find((panel) => insidePolygon(p, panelPolygon(page, panel)));
	if (hit) return hit;
	const distance = (panel: Panel) => {
		const b = panelBox(page, panel);
		const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
		const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
		return dx * dx + dy * dy;
	};
	return [...page.panels].sort((a, b) => distance(a) - distance(b))[0];
}

import { describe, expect, it } from 'vitest';
import { createComic } from '$lib/model/factory';
import { createBalloon } from '$lib/model/balloons';
import { MergePanelsCommand } from '$lib/model/commands/panels';
import { describeComic } from './describe';

describe('describeComic', () => {
	it('summarises pages, panels and balloons for an agent', () => {
		const comic = createComic('Riverbanks');
		const page = comic.pages[0];
		const merge = MergePanelsCommand.create(page, [page.panels[0].id, page.panels[1].id]);
		if (!merge.ok) throw new Error();
		merge.command.execute();
		const balloon = createBalloon(page, 'speech');
		balloon.html = '<p>HI <strong>THERE</strong></p>';
		page.balloons.push(balloon);

		const d = describeComic(comic, { id: 'c1', rev: 3, appUrl: 'https://app.test' });
		expect(d.title).toBe('Riverbanks');
		expect(d.rev).toBe(3);
		expect(d.pages).toHaveLength(1);
		const p = d.pages[0];
		expect(p.number).toBe(1);
		expect(p.url).toBe('https://app.test/comics/c1?page=1');
		expect(p.grid).toEqual({ rows: 3, cols: 4 });
		expect(p.panels).toHaveLength(11);
		expect(p.panels[0]).toMatchObject({ kind: 'grid', cells: [0, 1], hasImage: false });
		expect(p.panels[0].bbox.w).toBeGreaterThan(p.panels[1].bbox.w);
		expect(p.balloons[0]).toMatchObject({ type: 'speech', text: 'HI **THERE**' });
	});

	it('lists panels in reading order with integer bboxes', () => {
		const d = describeComic(createComic(), { id: 'c', rev: 1, appUrl: '' });
		const cells = d.pages[0].panels.map((p) => ('cells' in p ? p.cells[0] : -1));
		expect(cells).toEqual([...Array(12).keys()]);
		expect(Number.isInteger(d.pages[0].panels[5].bbox.x)).toBe(true);
	});
});

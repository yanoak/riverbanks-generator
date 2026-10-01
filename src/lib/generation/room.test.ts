import { describe, expect, it } from 'vitest';
import { letteringRoom, ROOM_KEYS } from './room';

const box = { x: 100, y: 100, w: 400, h: 300 };
const at = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h });

describe('letteringRoom', () => {
	it('defaults to the top when the panel has no balloons', () => {
		expect(letteringRoom(box, [])).toBe('top');
	});

	it('names the part of the panel the balloons sit over', () => {
		expect(letteringRoom(box, [at(110, 110)])).toBe('upper-left');
		expect(letteringRoom(box, [at(390, 110)])).toBe('upper-right');
		expect(letteringRoom(box, [at(110, 320)])).toBe('lower-left');
		expect(letteringRoom(box, [at(250, 330)])).toBe('bottom');
		expect(letteringRoom(box, [at(110, 220)])).toBe('left');
	});

	it('calls balloons spread along the top "top"', () => {
		expect(letteringRoom(box, [at(110, 110), at(390, 110)])).toBe('top');
	});

	it('ignores balloons outside the panel', () => {
		expect(letteringRoom(box, [at(700, 700)])).toBe('top');
	});

	it('only ever gives a known key', () => {
		expect(ROOM_KEYS).toContain(letteringRoom(box, [at(250, 220)]));
	});
});

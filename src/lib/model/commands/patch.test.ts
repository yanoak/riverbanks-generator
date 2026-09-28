import { describe, expect, it } from 'vitest';
import { PatchCommand } from './patch';

describe('PatchCommand', () => {
	it('applies a patch and restores exactly the previous values on undo', () => {
		const balloon = { x: 10, y: 20, w: 100, h: 50, html: 'hi' };
		const cmd = new PatchCommand('Move balloon', balloon, { x: 30, y: 40 });
		cmd.execute();
		expect(balloon).toEqual({ x: 30, y: 40, w: 100, h: 50, html: 'hi' });
		cmd.undo();
		expect(balloon).toEqual({ x: 10, y: 20, w: 100, h: 50, html: 'hi' });
	});

	it('fromChange captures a gesture that was already applied live', () => {
		const panel = { x: 0, y: 0, w: 10, h: 10 };
		panel.x = 50; // dragged live
		panel.w = 20;
		const cmd = PatchCommand.fromChange('Resize', panel, { x: 0, w: 10 });
		expect(cmd).not.toBeNull();
		cmd!.undo();
		expect(panel).toEqual({ x: 0, y: 0, w: 10, h: 10 });
		cmd!.execute();
		expect(panel).toEqual({ x: 50, y: 0, w: 20, h: 10 });
	});

	it('fromChange returns null when nothing changed (a click, not a drag)', () => {
		const panel = { x: 1 };
		expect(PatchCommand.fromChange('Move', panel, { x: 1 })).toBeNull();
	});

	it('removes a key on undo when it did not exist before', () => {
		const panel: { id: string; image?: { assetId: string } } = { id: 'p' };
		const cmd = new PatchCommand('Set image', panel, { image: { assetId: 'a' } });
		cmd.execute();
		expect(panel.image).toEqual({ assetId: 'a' });
		cmd.undo();
		expect('image' in panel).toBe(false);
	});
});

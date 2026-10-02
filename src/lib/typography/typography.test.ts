import { describe, expect, it } from 'vitest';
import { createPage } from '$lib/model/factory';
import { createBalloon, LETTERING_FONT, SFX_FONT } from '$lib/model/balloons';
import type { Balloon, BalloonType } from '$lib/model/types';
import { fontStack } from './fonts';
import { DEFAULT_TYPOGRAPHY, letteringFor, resolveTypography } from './typography';

const balloon = (type: BalloonType, font?: string): Balloon => {
	const b = createBalloon(createPage(), type);
	if (font !== undefined) b.font = font;
	return b;
};

describe('resolveTypography', () => {
	it('is the house default when nothing is set', () => {
		expect(resolveTypography({})).toEqual(DEFAULT_TYPOGRAPHY);
		expect(resolveTypography(undefined)).toEqual(DEFAULT_TYPOGRAPHY);
	});

	it('letters titles in Rubik Microbe capitals, also for styles stored before titles', () => {
		expect(DEFAULT_TYPOGRAPHY.title).toMatchObject({ family: 'Rubik Microbe', uppercase: true });
		expect(resolveTypography({ speech: DEFAULT_TYPOGRAPHY.speech }).title).toEqual(
			DEFAULT_TYPOGRAPHY.title
		);
	});

	it('overrides only the types it names', () => {
		const t = resolveTypography({
			caption: { family: 'Rubik Dirt', weight: 400, italic: false, uppercase: true }
		});
		expect(t.caption.family).toBe('Rubik Dirt');
		expect(t.speech).toEqual(DEFAULT_TYPOGRAPHY.speech);
	});

	it('falls back to the default for an unknown family', () => {
		const t = resolveTypography({
			speech: { family: 'Papyrus', weight: 400, italic: false, uppercase: false }
		});
		expect(t.speech).toEqual(DEFAULT_TYPOGRAPHY.speech);
	});

	it('snaps a weight the family lacks to the nearest one it has', () => {
		const t = resolveTypography({
			sfx: { family: 'Rubik Dirt', weight: 800, italic: false, uppercase: false },
			shout: { family: 'Rubik', weight: 1000, italic: false, uppercase: true }
		});
		expect(t.sfx.weight).toBe(400);
		expect(t.shout.weight).toBe(900);
	});

	it('ignores junk from the database', () => {
		const t = resolveTypography({ speech: 'Rubik', nonsense: {} } as never);
		expect(t).toEqual(DEFAULT_TYPOGRAPHY);
	});
});

describe('letteringFor', () => {
	const t = resolveTypography({});

	it('gives a balloon with no font its type’s lettering', () => {
		const l = letteringFor(balloon('caption'), t);
		expect(l.fontFamily).toBe(fontStack(t.caption.family));
		expect(l.fontWeight).toBe(t.caption.weight);
		expect(l.fontStyle).toBe(t.caption.italic ? 'italic' : 'normal');
		expect(l.textTransform).toBe(t.caption.uppercase ? 'uppercase' : 'none');
	});

	it('lets a balloon’s own font win, plain', () => {
		const l = letteringFor(balloon('caption', "'Bangers', cursive"), t);
		expect(l).toEqual({
			fontFamily: "'Bangers', cursive",
			fontWeight: 400,
			fontStyle: 'normal',
			textTransform: 'none'
		});
	});

	it('treats the old default stamps as unset', () => {
		expect(letteringFor(balloon('speech', LETTERING_FONT), t).fontFamily).toBe(
			fontStack(t.speech.family)
		);
		expect(letteringFor(balloon('sfx', SFX_FONT), t).fontFamily).toBe(fontStack(t.sfx.family));
	});

	it('keeps an old stamp that does not match the balloon’s type', () => {
		expect(letteringFor(balloon('speech', SFX_FONT), t).fontFamily).toBe(SFX_FONT);
	});

	it('follows the balloon’s type when it changes', () => {
		const b = balloon('speech');
		b.type = 'sfx';
		expect(letteringFor(b, t).fontFamily).toBe(fontStack(t.sfx.family));
	});
});

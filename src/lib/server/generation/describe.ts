// "Describe from references": a vision model drafts a profile's written half (style, palette,
// avoid) from its reference images. The person edits the result before it matters.

import type { PaletteColor } from '$lib/styles/styles';
import { generateContent, inline, textOf, type GeminiOptions, type InlineImage } from './gemini';

export const DESCRIBE_MODEL = 'gemini-3.1-flash-lite';

export interface StyleDescription {
	style: string;
	palette: PaletteColor[];
	avoid: string;
}

const INSTRUCTIONS = `These are reference images for a comic's art style. Describe the style so an
image model could reproduce it in new panels, whatever the subject.

- style: 2 to 5 sentences on medium, linework, shading and rendering, texture, lighting, level of
  detail and mood. Describe how it is drawn, never what is depicted.
- palette: the 4 to 8 colours that define the look, most prominent first, each as #rrggbb with a
  short plain name.
- avoid: a short comma-separated list of things that would break this style.`;

const SCHEMA = {
	type: 'object',
	properties: {
		style: { type: 'string' },
		palette: {
			type: 'array',
			items: {
				type: 'object',
				properties: { hex: { type: 'string' }, name: { type: 'string' } },
				required: ['hex', 'name']
			}
		},
		avoid: { type: 'string' }
	},
	required: ['style', 'palette', 'avoid']
};

export function normalizeHex(raw: string): string | null {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
	if (!m) return null;
	const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
	return `#${h.toLowerCase()}`;
}

export async function describeStyle(
	images: InlineImage[],
	opts: GeminiOptions
): Promise<StyleDescription> {
	if (!images.length) throw new Error('Add a reference image first.');
	const response = await generateContent(
		DESCRIBE_MODEL,
		{
			contents: [{ role: 'user', parts: [...images.map(inline), { text: INSTRUCTIONS }] }],
			generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA }
		},
		opts
	);
	let parsed: Partial<StyleDescription>;
	try {
		parsed = JSON.parse(textOf(response));
	} catch {
		throw new Error('Gemini gave an unexpected answer; try again.');
	}
	if (typeof parsed.style !== 'string' || !Array.isArray(parsed.palette))
		throw new Error('Gemini gave an unexpected answer; try again.');

	const seen = new Set<string>();
	const palette: PaletteColor[] = [];
	for (const c of parsed.palette) {
		const hex = normalizeHex(String(c?.hex ?? ''));
		if (!hex || seen.has(hex)) continue;
		seen.add(hex);
		palette.push(c.name ? { hex, name: String(c.name) } : { hex });
	}
	return { style: parsed.style.trim(), palette, avoid: String(parsed.avoid ?? '').trim() };
}

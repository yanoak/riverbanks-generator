import { describe, expect, it, vi } from 'vitest';
import { describeStyle, normalizeHex } from './describe';

const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' };

function gemini(json: unknown) {
	return vi.fn(async () =>
		Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] })
	);
}

describe('normalizeHex', () => {
	it('accepts #rgb, rrggbb and #RRGGBB, returning lower-case #rrggbb', () => {
		expect(normalizeHex('#ABC')).toBe('#aabbcc');
		expect(normalizeHex('1D3557')).toBe('#1d3557');
		expect(normalizeHex(' #e76f51 ')).toBe('#e76f51');
	});

	it('rejects anything else', () => {
		expect(normalizeHex('navy')).toBeNull();
		expect(normalizeHex('#12345')).toBeNull();
		expect(normalizeHex('#gggggg')).toBeNull();
	});
});

describe('describeStyle', () => {
	it('sends the images inline with a JSON schema, and returns the parsed fields', async () => {
		const fetch = gemini({
			style: 'Loose brush ink.',
			palette: [
				{ hex: '#1D3557', name: 'deep navy' },
				{ hex: 'not a colour', name: 'bad' },
				{ hex: '#1d3557', name: 'duplicate' }
			],
			avoid: 'gradients'
		});
		const out = await describeStyle([image, image], { apiKey: 'k', fetch });
		expect(out).toEqual({
			style: 'Loose brush ink.',
			palette: [{ hex: '#1d3557', name: 'deep navy' }],
			avoid: 'gradients'
		});

		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toMatch(/models\/gemini-[\w.-]+:generateContent$/);
		expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
		const body = JSON.parse(init.body as string);
		const parts = body.contents[0].parts;
		expect(parts.filter((p: { inlineData?: unknown }) => p.inlineData)).toHaveLength(2);
		expect(parts[0].inlineData).toEqual({ mimeType: 'image/png', data: 'AQID' });
		expect(body.generationConfig.responseMimeType).toBe('application/json');
		expect(body.generationConfig.responseJsonSchema.required).toEqual([
			'style',
			'palette',
			'avoid'
		]);
	});

	it('refuses to run without images', async () => {
		await expect(describeStyle([], { apiKey: 'k', fetch: gemini({}) })).rejects.toThrow(
			/Add a reference image/
		);
	});

	it('reports an API error with its message', async () => {
		const fetch = vi.fn(async () =>
			Response.json({ error: { message: 'API key not valid' } }, { status: 400 })
		);
		await expect(describeStyle([image], { apiKey: 'k', fetch })).rejects.toThrow(
			'Gemini: API key not valid'
		);
	});

	it('reports a response that is not the expected JSON', async () => {
		const fetch = vi.fn(async () =>
			Response.json({ candidates: [{ content: { parts: [{ text: 'sorry' }] } }] })
		);
		await expect(describeStyle([image], { apiKey: 'k', fetch })).rejects.toThrow(
			/unexpected answer/
		);
	});
});

import { describe, expect, it, vi } from 'vitest';
import { modelFor } from '$lib/generation/models';
import { geminiProvider } from './gemini-image';

const model = modelFor('gemini-flash')!;
const ref = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' };

const reply = (body: unknown, status = 200) => vi.fn(async () => Response.json(body, { status }));

describe('geminiProvider', () => {
	it('attaches references before the prompt, asks for an image at the aspect, returns it', async () => {
		const fetch = reply({
			candidates: [
				{
					content: {
						parts: [
							{ text: 'Here you go' },
							{ inlineData: { mimeType: 'image/png', data: 'BAUG' } }
						]
					}
				}
			]
		});
		const out = await geminiProvider({ apiKey: 'k', fetch }).generate({
			model,
			prompt: 'Draw one comic panel.',
			refs: [ref, ref],
			aspect: '21:9'
		});
		expect(out).toEqual({ bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/png' });

		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toMatch(/models\/gemini-3\.1-flash-image:generateContent$/);
		const body = JSON.parse(init.body as string);
		const parts = body.contents[0].parts;
		expect(parts.map((p: object) => Object.keys(p)[0])).toEqual([
			'inlineData',
			'inlineData',
			'text'
		]);
		expect(parts[2].text).toBe('Draw one comic panel.');
		expect(body.generationConfig.responseModalities).toContain('IMAGE');
		expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '21:9', imageSize: '2K' });
	});

	it('a blocked prompt says so', async () => {
		const fetch = reply({ promptFeedback: { blockReason: 'SAFETY' } });
		await expect(
			geminiProvider({ apiKey: 'k', fetch }).generate({
				model,
				prompt: 'x',
				refs: [],
				aspect: '1:1'
			})
		).rejects.toThrow('Gemini refused this prompt (SAFETY).');
	});

	it('an answer with no image passes on what the model said', async () => {
		const fetch = reply({
			candidates: [
				{ finishReason: 'STOP', content: { parts: [{ text: 'I can only describe this.' }] } }
			]
		});
		await expect(
			geminiProvider({ apiKey: 'k', fetch }).generate({
				model,
				prompt: 'x',
				refs: [],
				aspect: '1:1'
			})
		).rejects.toThrow('Gemini returned no image: I can only describe this.');
	});

	it('an image withheld for safety names the reason', async () => {
		const fetch = reply({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] });
		await expect(
			geminiProvider({ apiKey: 'k', fetch }).generate({
				model,
				prompt: 'x',
				refs: [],
				aspect: '1:1'
			})
		).rejects.toThrow('Gemini returned no image (IMAGE_SAFETY).');
	});
});

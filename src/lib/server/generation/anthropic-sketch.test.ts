import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { modelFor } from '$lib/generation/models';
import { anthropicSketchProvider } from './anthropic-sketch';

const model = modelFor('sketch-claude')!;
const ref = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' };
const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 333"><path d="M0 0"/><script>x</script></svg>';

function client(reply: Partial<Anthropic.Message>) {
	const create = vi.fn(async () => ({ stop_reason: 'end_turn', content: [], ...reply }));
	return { create, client: { messages: { create } } as unknown as Anthropic };
}

describe('anthropicSketchProvider', () => {
	it('asks Claude Sonnet for one SVG at the viewBox, with references, and returns it sanitised', async () => {
		const { create, client: c } = client({
			content: [{ type: 'text', text: `Here you go:\n${SVG}` } as Anthropic.TextBlock]
		});
		const out = await anthropicSketchProvider(c).generate({
			model,
			prompt: 'Draw one comic panel.\n\nPanel: a heron',
			refs: [ref, { bytes: new Uint8Array([9]), mimeType: 'image/avif' }],
			aspect: '1000:333',
			size: 'svg'
		});
		expect(out.mimeType).toBe('image/svg+xml');
		const svg = new TextDecoder().decode(out.bytes);
		expect(svg).toContain('<path d="M0 0"/>');
		expect(svg).not.toContain('script');

		const [params] = create.mock.calls[0] as unknown as [Anthropic.MessageCreateParams];
		expect(params.model).toBe('claude-sonnet-5');
		expect(params.thinking).toEqual({ type: 'adaptive' });
		expect(params.output_config).toEqual({ effort: 'low' });
		expect(String(params.system)).toContain('viewBox="0 0 1000 333"');
		const content = params.messages[0].content as Anthropic.ContentBlockParam[];
		// The AVIF reference is skipped (Claude reads PNG, JPEG, GIF and WebP); the prompt is last.
		expect(content.map((b) => b.type)).toEqual(['image', 'text']);
		expect(content[0]).toEqual({
			type: 'image',
			source: { type: 'base64', media_type: 'image/webp', data: 'AQID' }
		});
		expect((content[1] as Anthropic.TextBlockParam).text).toContain('a heron');
	});

	it.each([
		[{ stop_reason: 'refusal' }, 'Claude declined to draw this panel.'],
		[{ stop_reason: 'max_tokens' }, /ran too long/],
		[{ content: [{ type: 'text', text: 'I cannot draw.' }] }, /did not return a drawing/]
	])('%o is a clear error', async (reply, message) => {
		const { client: c } = client(reply as Partial<Anthropic.Message>);
		await expect(
			anthropicSketchProvider(c).generate({
				model,
				prompt: 'x',
				refs: [],
				aspect: '1:1',
				size: 'svg'
			})
		).rejects.toThrow(message);
	});
});

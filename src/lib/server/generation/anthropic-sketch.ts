// Sketches drawn by Claude as SVG: line art at the panel's exact shape, a few cents each and
// vector, so they print at any size. The reply is sanitised before anyone stores it.
import Anthropic from '@anthropic-ai/sdk';
import { viewBoxFor } from '$lib/generation/aspect';
import { sanitizeSvg } from '$lib/generation/svg';
import type { ImageProvider } from './provider';

const READABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const system = (viewBox: string) => `You are a comic artist who sketches panels directly as SVG.

Reply with exactly one <svg> element and nothing else. Give it xmlns="http://www.w3.org/2000/svg" and viewBox="${viewBox}". The drawing must fill that whole frame: it is the panel.

Draw a confident line-art sketch of the panel described: clear silhouettes, readable staging and a sense of depth, with flat fills from the style's palette where they help. Use paths, shapes, groups and gradients. Follow the style notes and the reference images for line quality, shapes and colour, but draw a new picture of what the panel describes.

Do not use <text>, <image>, <foreignObject>, scripts, external links or fonts: lettering is added separately.`;

export function anthropicSketchProvider(client: Anthropic): ImageProvider {
	return {
		async generate({ model, prompt, refs, aspect, signal }) {
			const images: Anthropic.ImageBlockParam[] = refs
				.filter((r) => READABLE.has(r.mimeType))
				.map((r) => ({
					type: 'image',
					source: {
						type: 'base64',
						media_type: r.mimeType as Anthropic.Base64ImageSource['media_type'],
						data: Buffer.from(r.bytes).toString('base64')
					}
				}));
			const response = await client.messages.create(
				{
					model: model.id,
					max_tokens: 16000,
					thinking: { type: 'adaptive' },
					output_config: { effort: 'low' },
					system: system(viewBoxFor(aspect)),
					messages: [{ role: 'user', content: [...images, { type: 'text', text: prompt }] }]
				},
				{ signal }
			);
			if (response.stop_reason === 'refusal')
				throw new Error('Claude declined to draw this panel.');
			if (response.stop_reason === 'max_tokens')
				throw new Error('The sketch ran too long; try describing a simpler panel.');
			const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
			let svg: string;
			try {
				svg = sanitizeSvg(text);
			} catch (e) {
				throw new Error(`Claude did not return a drawing we can use (${(e as Error).message})`, {
					cause: e
				});
			}
			return { bytes: new TextEncoder().encode(svg), mimeType: 'image/svg+xml' };
		}
	};
}

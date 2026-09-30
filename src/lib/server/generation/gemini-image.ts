// Image generation with Gemini (Nano Banana): references go inline, before the prompt that
// numbers them.
import { generateContent, inline, type GeminiOptions } from './gemini';
import type { ImageProvider } from './provider';

export function geminiProvider(opts: Omit<GeminiOptions, 'signal'>): ImageProvider {
	return {
		async generate({ model, prompt, refs, aspect, size, signal }) {
			const response = await generateContent(
				model.id,
				{
					contents: [{ role: 'user', parts: [...refs.map(inline), { text: prompt }] }],
					generationConfig: {
						responseModalities: ['TEXT', 'IMAGE'],
						imageConfig: { aspectRatio: aspect, imageSize: size }
					}
				},
				{ ...opts, signal }
			);
			const blocked = response.promptFeedback?.blockReason;
			if (blocked) throw new Error(`Gemini refused this prompt (${blocked}).`);

			const candidate = response.candidates?.[0];
			const parts = candidate?.content?.parts ?? [];
			const image = parts.find((p) => p.inlineData)?.inlineData;
			if (image) {
				return {
					bytes: new Uint8Array(Buffer.from(image.data, 'base64')),
					mimeType: image.mimeType
				};
			}
			const said = parts
				.map((p) => p.text ?? '')
				.join(' ')
				.trim();
			if (said) throw new Error(`Gemini returned no image: ${said.slice(0, 300)}`);
			throw new Error(
				`Gemini returned no image (${candidate?.finishReason ?? 'no reason given'}).`
			);
		}
	};
}

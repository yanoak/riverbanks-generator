// The Gemini REST API (generateContent), used for describing references and generating images.
// Plain fetch rather than @google/genai: one endpoint, and tests can hand in a fake fetch.

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiOptions {
	apiKey: string;
	fetch?: typeof fetch;
	signal?: AbortSignal;
}

export interface InlineImage {
	bytes: Uint8Array;
	mimeType: string;
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GeminiResponse {
	candidates?: {
		content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] };
		finishReason?: string;
	}[];
	promptFeedback?: { blockReason?: string };
}

export function base64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64');
}

export const inline = (img: InlineImage): Part => ({
	inlineData: { mimeType: img.mimeType, data: base64(img.bytes) }
});

export async function generateContent(
	model: string,
	body: unknown,
	opts: GeminiOptions
): Promise<GeminiResponse> {
	const res = await (opts.fetch ?? fetch)(`${GEMINI_BASE}/models/${model}:generateContent`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
		body: JSON.stringify(body),
		signal: opts.signal
	});
	const json = (await res.json().catch(() => ({}))) as GeminiResponse & {
		error?: { message?: string };
	};
	if (!res.ok) throw new Error(`Gemini: ${json.error?.message ?? `HTTP ${res.status}`}`);
	return json;
}

/** The concatenated text parts of the first candidate. */
export const textOf = (r: GeminiResponse) =>
	(r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');

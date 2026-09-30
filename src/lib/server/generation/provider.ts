// An image provider turns a composed prompt, reference images and an aspect into image bytes.
import type { ModelInfo } from '$lib/generation/models';
import type { InlineImage } from './gemini';

export interface RefImage extends InlineImage {
	/** A short-lived public URL of the same image, for providers that fetch references. */
	url?: string;
}

export interface GenerateRequest {
	model: ModelInfo;
	prompt: string;
	refs: RefImage[];
	aspect: string;
	/** The provider's size setting, from the model's draft or print size. */
	size: string;
	signal?: AbortSignal;
	/** Called with the provider's job id as soon as it has one (Higgsfield). */
	onJob?: (ref: string) => void;
}

export interface GeneratedImage {
	bytes: Uint8Array;
	mimeType: string;
}

export interface ImageProvider {
	generate(req: GenerateRequest): Promise<GeneratedImage>;
}

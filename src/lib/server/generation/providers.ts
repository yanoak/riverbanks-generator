// Which provider serves a model, given the keys this server has.
import type { ModelInfo, Provider } from '$lib/generation/models';
import { OpError } from '$lib/ops/ops';
import Anthropic from '@anthropic-ai/sdk';
import { anthropicKey, geminiKey, higgsfieldCredentials, useFake } from './env';
import { anthropicSketchProvider } from './anthropic-sketch';
import { fakeProvider } from './fake';
import { geminiProvider } from './gemini-image';
import { higgsfieldProvider } from './higgsfield';
import type { ImageProvider } from './provider';

/** Providers usable here. With GENERATION_PROVIDER=fake, all of them (served by the fake). */
export function configuredProviders(): Set<Provider> {
	if (useFake()) return new Set(['gemini', 'higgsfield', 'anthropic', 'fake']);
	const out = new Set<Provider>();
	if (geminiKey()) out.add('gemini');
	if (higgsfieldCredentials()) out.add('higgsfield');
	if (anthropicKey()) out.add('anthropic');
	return out;
}

export function providerFor(model: ModelInfo): ImageProvider {
	if (useFake() || model.provider === 'fake') return fakeProvider();
	if (model.provider === 'gemini') {
		const apiKey = geminiKey();
		if (apiKey) return geminiProvider({ apiKey });
	}
	if (model.provider === 'anthropic') {
		const apiKey = anthropicKey();
		if (apiKey) return anthropicSketchProvider(new Anthropic({ apiKey }));
	}
	if (model.provider === 'higgsfield') {
		const credentials = higgsfieldCredentials();
		if (credentials) return higgsfieldProvider(credentials);
	}
	throw new OpError('invalid', `${model.label} isn’t set up on this server.`);
}

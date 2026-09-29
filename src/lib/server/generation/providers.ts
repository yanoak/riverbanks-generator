// Which provider serves a model, given the keys this server has.
import type { ModelInfo, Provider } from '$lib/generation/models';
import { OpError } from '$lib/ops/ops';
import { geminiKey, useFake } from './env';
import { fakeProvider } from './fake';
import { geminiProvider } from './gemini-image';
import type { ImageProvider } from './provider';

/** Providers usable here. With GENERATION_PROVIDER=fake, all of them (served by the fake). */
export function configuredProviders(): Set<Provider> {
	if (useFake()) return new Set(['gemini', 'higgsfield', 'fake']);
	const out = new Set<Provider>();
	if (geminiKey()) out.add('gemini');
	return out;
}

export function providerFor(model: ModelInfo): ImageProvider {
	if (useFake() || model.provider === 'fake') return fakeProvider();
	if (model.provider === 'gemini') {
		const apiKey = geminiKey();
		if (apiKey) return geminiProvider({ apiKey });
	}
	throw new OpError('invalid', `${model.label} isn’t set up on this server.`);
}

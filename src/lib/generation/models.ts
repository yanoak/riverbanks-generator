// Every image model the app can use, as data: pickers, reference caps and aspect choice all
// read from here, so adding a model is one entry. Provider ids are from the providers' docs
// (checked 2026-09-29; see plans/2026-09-29_style-profiles-generation.plan.md).

import type { RefLimits } from './refs';

export type Provider = 'gemini' | 'higgsfield' | 'fake';

export interface ModelInfo extends RefLimits {
	/** Stored on profiles and generations; stable even if the provider id changes. */
	key: string;
	provider: Provider;
	/** The provider's model id or endpoint path. */
	id: string;
	label: string;
	/** Supported aspect ratios, W:H. */
	aspects: string[];
	/** Shown under the picker. */
	note?: string;
}

const GEMINI_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

export const MODELS: ModelInfo[] = [
	{
		key: 'gemini-flash',
		provider: 'gemini',
		id: 'gemini-3.1-flash-image',
		label: 'Nano Banana 2',
		aspects: [...GEMINI_ASPECTS, '1:4', '4:1', '1:8', '8:1'],
		maxRefs: 14,
		roleCaps: { style: 3, character: 4, object: 10 },
		note: 'Gemini · about $0.10 an image'
	},
	{
		key: 'gemini-pro',
		provider: 'gemini',
		id: 'gemini-3-pro-image',
		label: 'Nano Banana Pro',
		aspects: GEMINI_ASPECTS,
		maxRefs: 11,
		roleCaps: { style: 3, character: 5, object: 3 },
		note: 'Gemini · slower, about $0.13 an image'
	},
	{
		key: 'fake',
		provider: 'fake',
		id: 'fake',
		label: 'Test pattern',
		aspects: [...GEMINI_ASPECTS, '1:4', '4:1'],
		maxRefs: 14,
		note: 'Free stand-in for tests'
	}
];

export const DEFAULT_MODEL = 'gemini-flash';

export const modelFor = (key: string | null | undefined) => MODELS.find((m) => m.key === key);

export const availableModels = (providers: Set<Provider>) =>
	MODELS.filter((m) => providers.has(m.provider));

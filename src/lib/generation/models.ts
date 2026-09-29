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
	/** Some models only edit: they need at least this many references. */
	minRefs?: number;
	/** Extra request fields for this model (Higgsfield: its resolution setting). */
	params?: Record<string, string>;
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
	// Higgsfield's public API (https://docs.higgsfield.ai/docs/models/image-generation). The ratio
	// lists of Qwen and Soul, and the request field names, are unverified until a live call.
	{
		key: 'hf-grok-image-2',
		provider: 'higgsfield',
		id: '/xai/grok-imagine-image-2.0',
		label: 'Grok Image 2.0',
		aspects: ['1:1', '1:2', '2:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
		maxRefs: 10,
		params: { resolution: '2k' },
		note: 'Higgsfield'
	},
	{
		key: 'hf-marketing-studio',
		provider: 'higgsfield',
		id: '/marketing-studio/image',
		label: 'Marketing Studio Image',
		aspects: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'],
		maxRefs: 16,
		params: { resolution: '2k' },
		note: 'Higgsfield · takes the most references'
	},
	{
		key: 'hf-qwen-edit',
		provider: 'higgsfield',
		id: '/alibaba/qwen-image-3/edit',
		label: 'Qwen Image 3 (edit)',
		aspects: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
		maxRefs: 3,
		minRefs: 1,
		params: { resolution: '2k' },
		note: 'Higgsfield · redraws from 1–3 references'
	},
	{
		key: 'hf-soul-v2',
		provider: 'higgsfield',
		id: '/higgsfield-ai/soul/v2/standard',
		label: 'Soul V2',
		aspects: ['1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9'],
		maxRefs: 0,
		params: { resolution: '1080p' },
		note: 'Higgsfield · text only: ignores the style’s images'
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

/** What the browser needs to offer a model. */
export type ModelOption = Pick<ModelInfo, 'key' | 'label' | 'note' | 'aspects' | 'maxRefs'>;

export const toOption = ({ key, label, note, aspects, maxRefs }: ModelInfo): ModelOption => ({
	key,
	label,
	note,
	aspects,
	maxRefs
});

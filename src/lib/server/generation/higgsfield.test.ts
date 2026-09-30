import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelFor } from '$lib/generation/models';
import { higgsfieldProvider } from './higgsfield';

const grok = modelFor('hf-grok-image-2')!;
const png = new Uint8Array([137, 80, 78, 71]);

/** A scripted Higgsfield: submit, then each status in turn, then the image. */
function server(statuses: object[]) {
	const queue = [...statuses];
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (init?.method === 'POST')
			return Response.json({ status: 'queued', request_id: 'req-1', status_url: '…' });
		if (url.endsWith('/requests/req-1/status')) return Response.json(queue.shift());
		if (url === 'https://cdn.example/out.png')
			return new Response(png, { headers: { 'content-type': 'image/png' } });
		return new Response('not found', { status: 404 });
	});
}

const request = (extra = {}) => ({
	model: grok,
	prompt: 'Draw one comic panel.',
	refs: [
		{ bytes: png, mimeType: 'image/png', url: 'https://storage.example/ref-1' },
		{ bytes: png, mimeType: 'image/png', url: 'https://storage.example/ref-2' }
	],
	aspect: '16:9',
	size: '2k',
	...extra
});

describe('higgsfieldProvider', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('submits with Key auth and reference URLs, polls to completion, downloads the image', async () => {
		const fetch = server([
			{ status: 'queued' },
			{ status: 'in_progress' },
			{ status: 'completed', images: [{ url: 'https://cdn.example/out.png' }] }
		]);
		const onJob = vi.fn();
		const done = higgsfieldProvider({ keyId: 'id', secret: 'sec', fetch }).generate(
			request({ onJob })
		);
		await vi.runAllTimersAsync();
		expect(await done).toEqual({ bytes: png, mimeType: 'image/png' });

		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://api.higgsfield.ai/xai/grok-imagine-image-2.0');
		expect((init.headers as Record<string, string>).authorization).toBe('Key id:sec');
		expect(JSON.parse(init.body as string)).toEqual({
			prompt: 'Draw one comic panel.',
			aspect_ratio: '16:9',
			resolution: '2k',
			image_urls: ['https://storage.example/ref-1', 'https://storage.example/ref-2']
		});
		expect(onJob).toHaveBeenCalledWith('req-1');
		const polls = fetch.mock.calls.filter(([u]) => String(u).endsWith('/status'));
		expect(polls).toHaveLength(3);
	});

	it('a text-only model gets no image_urls', async () => {
		const fetch = server([
			{ status: 'completed', images: [{ url: 'https://cdn.example/out.png' }] }
		]);
		const done = higgsfieldProvider({ keyId: 'id', secret: 'sec', fetch }).generate(
			request({ model: modelFor('hf-soul-v2')!, refs: [], size: '720p' })
		);
		await vi.runAllTimersAsync();
		await done;
		const body = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
		expect(body).not.toHaveProperty('image_urls');
		expect(body.resolution).toBe('720p');
	});

	it.each([
		[{ status: 'failed', error: 'bad input' }, 'Higgsfield: the job failed (bad input).'],
		[{ status: 'nsfw' }, 'Higgsfield refused this prompt as unsafe.'],
		[{ status: 'canceled' }, 'Higgsfield: the job was cancelled.']
	])('a %o job is a clear error', async (status, message) => {
		const fetch = server([status]);
		const done = higgsfieldProvider({ keyId: 'id', secret: 'sec', fetch }).generate(request());
		const check = expect(done).rejects.toThrow(message);
		await vi.runAllTimersAsync();
		await check;
	});

	it('gives up after the deadline, naming the job', async () => {
		const fetch = server(Array.from({ length: 500 }, () => ({ status: 'in_progress' })));
		const done = higgsfieldProvider({
			keyId: 'id',
			secret: 'sec',
			fetch,
			deadlineMs: 30_000
		}).generate(request());
		const check = expect(done).rejects.toThrow(/took too long.*req-1/);
		await vi.runAllTimersAsync();
		await check;
	});

	it('a refused submission passes on Higgsfield’s message', async () => {
		const fetch = vi.fn(async () =>
			Response.json({ detail: 'Not enough credits' }, { status: 402 })
		);
		const done = higgsfieldProvider({ keyId: 'id', secret: 'sec', fetch }).generate(request());
		await expect(done).rejects.toThrow('Higgsfield: Not enough credits');
	});

	it('references without a URL are a programming error, not a silent drop', async () => {
		const fetch = server([]);
		const done = higgsfieldProvider({ keyId: 'id', secret: 'sec', fetch }).generate(
			request({ refs: [{ bytes: png, mimeType: 'image/png' }] })
		);
		await expect(done).rejects.toThrow(/reference URL/);
	});
});

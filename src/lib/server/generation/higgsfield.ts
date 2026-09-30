// Image generation through Higgsfield's API: submit a job, poll it, download the result.
// References go as URLs (Higgsfield fetches them), so callers give each ref a signed link.
// https://docs.higgsfield.ai/docs/concepts/requests
import type { ImageProvider } from './provider';

export const HIGGSFIELD_BASE = 'https://api.higgsfield.ai';

export interface HiggsfieldOptions {
	keyId: string;
	secret: string;
	fetch?: typeof fetch;
	/** Stop polling after this long (the function itself may run 300 s). */
	deadlineMs?: number;
}

interface Status {
	status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled';
	images?: { url: string }[];
	error?: string;
}

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), {
			once: true
		});
	});

async function messageOf(res: Response): Promise<string> {
	const body = (await res.json().catch(() => ({}))) as { detail?: unknown; message?: string };
	const detail = typeof body.detail === 'string' ? body.detail : undefined;
	return detail ?? body.message ?? `HTTP ${res.status}`;
}

export function higgsfieldProvider(opts: HiggsfieldOptions): ImageProvider {
	const f = opts.fetch ?? fetch;
	const headers = {
		authorization: `Key ${opts.keyId}:${opts.secret}`,
		'content-type': 'application/json'
	};
	const deadlineMs = opts.deadlineMs ?? 240_000;

	return {
		async generate({ model, prompt, refs, aspect, size, signal, onJob }) {
			if (refs.some((r) => !r.url))
				throw new Error('Higgsfield needs a reference URL for every reference image.');
			const body: Record<string, unknown> = { prompt, aspect_ratio: aspect, resolution: size };
			if (refs.length) body.image_urls = refs.map((r) => r.url);

			const submitted = await f(`${HIGGSFIELD_BASE}${model.id}`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal
			});
			if (!submitted.ok) throw new Error(`Higgsfield: ${await messageOf(submitted)}`);
			const { request_id: id } = (await submitted.json()) as { request_id: string };
			onJob?.(id);

			const started = Date.now();
			for (let wait = 2000; ; wait = Math.min(wait * 1.5, 5000)) {
				await sleep(wait, signal);
				const res = await f(`${HIGGSFIELD_BASE}/requests/${id}/status`, { headers, signal });
				if (!res.ok) throw new Error(`Higgsfield: ${await messageOf(res)}`);
				const job = (await res.json()) as Status;
				if (job.status === 'completed') {
					const url = job.images?.[0]?.url;
					if (!url) throw new Error('Higgsfield finished without an image.');
					const image = await f(url, { signal });
					if (!image.ok)
						throw new Error(`Downloading Higgsfield’s image failed (HTTP ${image.status}).`);
					return {
						bytes: new Uint8Array(await image.arrayBuffer()),
						mimeType: (image.headers.get('content-type') ?? 'image/png').split(';')[0]
					};
				}
				if (job.status === 'failed')
					throw new Error(`Higgsfield: the job failed${job.error ? ` (${job.error})` : ''}.`);
				if (job.status === 'nsfw') throw new Error('Higgsfield refused this prompt as unsafe.');
				if (job.status === 'canceled') throw new Error('Higgsfield: the job was cancelled.');
				if (Date.now() - started > deadlineMs)
					throw new Error(`Higgsfield took too long; its job id is ${id}.`);
			}
		}
	};
}

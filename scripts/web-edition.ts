/**
 * Build the web edition: fill a comic with every page of the series, Prologue to Epilogue, each
 * panel image a smaller copy, so the editor's PDF button prints a web-sized PDF.
 *
 *     ./scripts/web-edition.sh TARGET_COMIC_ID [--dry-run] [--px-per-unit 1.6] [--quality 80]
 *
 * TARGET is a comic you made for it; its pages are replaced, so it must still be empty (one page,
 * no images or lettering) unless you pass --replace, as when re-running after source edits.
 *
 * Signs in as you (RIVERBANKS_EMAIL, and RIVERBANKS_PASSWORD or a hidden prompt) with the
 * project's publishable key (PUBLIC_SUPABASE_PUBLISHABLE_KEY), so row-level security applies.
 * The credits board comes last, rendered from its PDF in content/boards/.
 * Images land in content/web-edition/ (original/ and web/, not committed). --dry-run downloads
 * and resizes but writes nothing. Needs ImageMagick (`magick`).
 * Plan: 2026-10-12_web-edition-pdf.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import {
	imageNeeds,
	imagePage,
	joinComics,
	relineHtml,
	targetWidth,
	type ImageNeed
} from '$lib/export/web-edition';
import type { Comic } from '$lib/model/types';
import { projectComic } from '$lib/model/ydoc';
import { mutateComic } from '$lib/ops/ops';
import { openDoc } from '$lib/ops/ydoc-store';
import { SupabaseComicStore } from '$lib/persistence/supabase-store';

const PAO = '81f32223-022c-4e29-b0d9-b288632326c8'; // Prologue and Act One
const TITLES = '91f9a6f0-9c54-42f2-aa3e-43d9752d2c11'; // Riverbanks: Title Boards

/**
 * The series in reading order, as [comic, 1-based pages or all] (confirmed by Yan, 2026-10-12):
 * the two posters, then each act's divider board before the act. The Prologue is page 1 of
 * Prologue and Act One, so Act One's divider goes after it. The Epilogue has no divider.
 */
const SERIES: [string, number[]?][] = [
	[TITLES, [2, 1]], // the premiere poster first (Yan, 2026-10-12)
	[PAO, [1]],
	[TITLES, [3]],
	[PAO, [2, 3, 4, 5]],
	[TITLES, [4]],
	['5a2cdb4a-c822-4fb3-bb5e-5f7d2656a420'], // The Youngest Delegate
	[TITLES, [5]],
	['739cacfd-7664-4fd0-8ed1-b72d43207d96'], // Act Three: Kinetic Adaptation Economy
	[TITLES, [6]],
	['cfdcd0d6-0844-4f40-a7a3-f53006896247'], // The Year It Snowed
	[TITLES, [7]],
	['d89a6f17-e319-4102-b990-d2d55f83988d'], // Visa for a Hilsa
	['ccfbe106-b609-4cd3-b2d7-fbafd3c7098d'] // Epilogue: River of Seeds
];

/**
 * Divider titles the slides still have from before the acts were renamed, relettered in the web
 * edition only (Yan, 2026-10-12), by balloon id on the title boards.
 */
const RETITLE: Record<string, string[]> = {
	'98d0600e-05b4-427f-8327-f977585e3935': ['KINETIC', 'ADAPTATION', 'ECONOMY'], // YES / WE / K.A.N.
	'22107060-88fe-4643-b2e9-107c866d367f': ['THE YEAR', 'IT', 'SNOWED'] // GROSS / DELICIOUSNESS / INDEX
};

/**
 * The credits board (Yan, 2026-10-12), the last page: a one-page PDF rendered to a picture. Kept
 * sharper than the panels for its small type. Its asset id comes from the PDF's contents: a
 * comic's images can't be replaced, so a new PDF needs a new id.
 */
const CREDITS = {
	pdf: 'content/boards/RIVERBANKS CREDITS (A1).pdf',
	width: 2000
};

const OUT = 'content/web-edition';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
	const i = args.indexOf(name);
	return i >= 0 ? Number(args[i + 1]) : fallback;
};
const target = args.find((a) => /^[0-9a-f-]{36}$/i.test(a));
const dryRun = args.includes('--dry-run');
const replace = args.includes('--replace');
const pxPerUnit = flag('--px-per-unit', 1.6);
const quality = flag('--quality', 80);

function ask(question: string, hidden = false): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
	if (hidden) {
		const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
		(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) =>
			write.call(rl, s.startsWith(question) ? s : '');
	}
	return new Promise((resolve) =>
		rl.question(question, (answer) => {
			rl.close();
			if (hidden) process.stdout.write('\n');
			resolve(answer.trim());
		})
	);
}

/** Up to `n` at a time, results in input order. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i]);
			}
		})
	);
	return out;
}

/** Why a request failed, down to the network error under a bare "fetch failed". */
function describe(error: unknown): string {
	const parts: string[] = [];
	for (
		let e = error as { message?: string; cause?: unknown; originalError?: unknown } | undefined;
		e;
	) {
		if (e.message) parts.push(e.message);
		e = (e.originalError ?? e.cause) as typeof e;
	}
	return parts.join(' ← ') || String(error);
}

/** A storage call, tried up to four times with growing pauses, for dropped connections. */
async function retry<T>(
	what: string,
	call: () => Promise<{ data: T; error: unknown }>
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		let error: unknown;
		try {
			const result = await call();
			if (!result.error) return result.data;
			error = result.error;
		} catch (e) {
			error = e;
		}
		if (attempt === 4) throw new Error(`${what} failed: ${describe(error)}`);
		console.log(`${what} failed (${describe(error)}); trying again`);
		await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
	}
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
	if (!target) throw new Error('Name the comic to fill: web-edition.sh TARGET_COMIC_ID');
	const url = process.env.PUBLIC_SUPABASE_URL ?? 'https://krugthurasfvthjtchqo.supabase.co';
	const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!key)
		throw new Error('Set PUBLIC_SUPABASE_PUBLISHABLE_KEY (Dashboard → Project Settings → API).');
	const email = process.env.RIVERBANKS_EMAIL || (await ask('Riverbanks email: '));
	const password = process.env.RIVERBANKS_PASSWORD || (await ask('Password: ', true));

	const supabase = createClient(url, key, { auth: { persistSession: false } });
	const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
	if (error || !auth.user) throw new Error(`Sign-in failed: ${error?.message}`);
	const userId = auth.user.id;
	const store = new SupabaseComicStore(supabase);
	const bucket = supabase.storage.from('assets');

	// 1. The comics, as their Y.Docs stand now (snapshot plus pending updates).
	const existing = await openDoc(store, target);
	if (!existing) throw new Error(`No comic ${target} you can open.`);
	const current = projectComic(existing.doc);
	const empty =
		current.pages.length === 1 &&
		current.pages.every((p) => !p.balloons.length && p.panels.every((panel) => !panel.image));
	if (!empty && !replace)
		throw new Error(`${current.title} already has content; pass --replace to overwrite its pages.`);

	const comics: { id: string; comic: Comic }[] = [];
	for (const id of new Set(SERIES.map(([id]) => id))) {
		const opened = await openDoc(store, id);
		if (!opened) throw new Error(`Could not open comic ${id}.`);
		const comic = projectComic(opened.doc);
		console.log(`${comic.title}: ${comic.pages.length} pages`);
		comics.push({ id, comic });
	}
	const comicOf = (id: string) => comics.find((c) => c.id === id)!.comic;
	const needs = imageNeeds(comics);
	console.log(`${needs.length} images`);

	// 2. Download each original once (kept between runs), then resize it.
	for (const dir of ['original', 'web']) mkdirSync(join(OUT, dir), { recursive: true });
	let before = 0;
	let after = 0;
	const made = await pool(needs, 6, async (need: ImageNeed) => {
		const original = join(OUT, 'original', need.assetId);
		if (!existsSync(original)) {
			let { data } = await bucket.download(`${need.comicId}/${need.assetId}`);
			if (!data) ({ data } = await bucket.download(`${userId}/${need.assetId}`));
			if (!data) throw new Error(`Image ${need.assetId} of ${need.comicId} is missing.`);
			writeFileSync(original, Buffer.from(await data.arrayBuffer()));
		}
		const [w, opaque] = execFileSync('magick', ['identify', '-format', '%w %[opaque]\n', original])
			.toString()
			.split('\n')[0]
			.split(' ');
		// Transparent images stay PNG; everything else becomes JPEG.
		const png = opaque.toLowerCase() !== 'true';
		const web = join(OUT, 'web', `${need.assetId}.${png ? 'png' : 'jpg'}`);
		const width = targetWidth(need, Number(w), pxPerUnit);
		execFileSync('magick', [
			original,
			'-resize',
			`${width}x>`,
			'-strip',
			...(png
				? ['-define', 'png:compression-level=9']
				: ['-quality', String(quality), '-interlace', 'JPEG']),
			web
		]);
		before += statSync(original).size;
		after += statSync(web).size;
		return { need, web, type: png ? 'image/png' : 'image/jpeg' };
	});
	console.log(`Images: ${mb(before)} → ${mb(after)} at ${pxPerUnit} px per page unit`);

	// The credits, rendered from the PDF onto white.
	const hash = createHash('sha256').update(readFileSync(CREDITS.pdf)).digest('hex');
	const creditsId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
	const credits = join(OUT, 'web', `${creditsId}.jpg`);
	execFileSync('magick', [
		'-density',
		'300',
		`${CREDITS.pdf}[0]`,
		'-background',
		'white',
		'-flatten',
		'-resize',
		`${CREDITS.width}x`,
		'-strip',
		'-quality',
		String(quality),
		'-interlace',
		'JPEG',
		credits
	]);
	const [cw, ch] = execFileSync('magick', ['identify', '-format', '%w %h', credits])
		.toString()
		.split(' ')
		.map(Number);
	console.log(`Credits: ${cw} × ${ch}, ${mb(statSync(credits).size)}`);
	made.push({
		need: { comicId: target, assetId: creditsId, width: 1000 },
		web: credits,
		type: 'image/jpeg'
	});

	const joined = joinComics(
		target,
		current.title,
		SERIES.map(([id, pages]) => ({ comic: comicOf(id), pages: pages?.map((n) => n - 1) }))
	);
	joined.pages.push(imagePage(creditsId, cw, ch));
	const retitled = new Set<string>();
	for (const balloon of joined.pages.flatMap((p) => p.balloons))
		if (RETITLE[balloon.id]) {
			balloon.html = relineHtml(balloon.html, RETITLE[balloon.id]);
			retitled.add(balloon.id);
		}
	const missed = Object.keys(RETITLE).filter((id) => !retitled.has(id));
	if (missed.length) throw new Error(`Lettering to retitle not found: ${missed.join(', ')}`);
	console.log(`${current.title}: ${joined.pages.length} pages`);
	if (dryRun) return console.log('Dry run: nothing written.');

	// 3. The images first, in the target's folder under the same asset ids, then the pages. A
	// comic's images can be added but never replaced (storage has no update policy), so images
	// already there from an earlier run are kept: a new --quality only reaches new images.
	const present = new Set<string>();
	for (let offset = 0; ; offset += 1000) {
		const page = await retry("Listing the comic's images", () =>
			bucket.list(target, { limit: 1000, offset })
		);
		for (const o of page ?? []) present.add(o.name);
		if ((page ?? []).length < 1000) break;
	}
	const missing = made.filter(({ need }) => !present.has(need.assetId));
	console.log(`Uploading ${missing.length} images (${made.length - missing.length} already there)`);
	await pool(missing, 6, async ({ need, web, type }) => {
		// A retry after an upload that landed but lost its reply finds the image there: done.
		await retry(`Uploading ${need.assetId}`, async () => {
			const result = await bucket.upload(`${target}/${need.assetId}`, readFileSync(web), {
				contentType: type
			});
			return /already exists|duplicate/i.test(describe(result.error))
				? { data: null, error: null }
				: result;
		});
	});
	await mutateComic(store, target, (comic) => {
		comic.pages = joined.pages;
		comic.styleProfileId = joined.styleProfileId;
		return 'web edition';
	});
	console.log(`Filled https://riverbanks-generator.vercel.app/comics/${target}`);
}

main().then(
	() => process.exit(0),
	(e) => {
		console.error(describe(e));
		process.exit(1);
	}
);

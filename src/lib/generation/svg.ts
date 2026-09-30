// Sketches arrive as SVG written by a model (in the app, or an agent over MCP). Before one is
// stored it is rebuilt from an allowlist: drawing elements and presentation attributes only,
// nothing that runs, loads or links elsewhere, and no text (panels carry no lettering). Input
// that is not one well-formed <svg> is refused rather than repaired.

const ELEMENTS = new Set([
	'svg',
	'g',
	'path',
	'rect',
	'circle',
	'ellipse',
	'line',
	'polyline',
	'polygon',
	'defs',
	'linearGradient',
	'radialGradient',
	'stop',
	'clipPath',
	'mask',
	'pattern',
	'marker',
	'title',
	'desc',
	// Paper texture and hand-drawn wobble.
	'filter',
	'feTurbulence',
	'feDisplacementMap',
	'feGaussianBlur',
	'feColorMatrix',
	'feBlend',
	'feComposite',
	'feOffset',
	'feMorphology',
	'feFlood',
	'feMerge',
	'feMergeNode'
]);

/** Kept as text; everywhere else text nodes are dropped. */
const TEXT_OK = new Set(['title', 'desc']);

const TOKEN =
	/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)|(<)/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

const escapeText = (s: string) =>
	s.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/gi, '&amp;').replace(/</g, '&lt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

/** Only local references: url(#id), never url(http…) or url(data:…). */
function safeValue(name: string, value: string): boolean {
	if (/javascript:|data:|expression\s*\(|@import/i.test(value)) return false;
	for (const m of value.matchAll(/url\(\s*['"]?([^'")\s]*)/gi))
		if (!m[1].startsWith('#')) return false;
	if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) return false;
	return true;
}

function attributes(raw: string): [string, string][] {
	const out: [string, string][] = [];
	for (const m of raw.matchAll(ATTR)) {
		const name = m[1];
		const value = m[2] ?? m[3] ?? '';
		if (!/^[A-Za-z][\w:.-]*$/.test(name) || /^on/i.test(name)) continue;
		if (!safeValue(name, value)) continue;
		out.push([name, value]);
	}
	return out;
}

/** The first <svg>…</svg> in `input` (which may be a chatty model reply), made safe. */
export function sanitizeSvg(input: string): string {
	const start = input.search(/<svg[\s>]/i);
	const end = input.lastIndexOf('</svg>');
	if (start < 0 || end < start) throw new Error('No <svg> drawing found.');
	const source = input
		.slice(start, end + '</svg>'.length)
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
		.replace(/<\?[\s\S]*?\?>/g, '')
		.replace(/<!DOCTYPE[^>]*>/gi, '');

	const out: string[] = [];
	// `skips`: this element started a dropped subtree (its close ends the skip).
	const stack: { name: string; skips: boolean }[] = [];
	let skipping = 0; // depth of dropped subtrees we are inside
	let roots = 0;

	for (const m of source.matchAll(TOKEN)) {
		const [, closing, name, rawAttrs, selfClosing, text, strayLt] = m;
		if (strayLt) throw new Error('The SVG is not well-formed.');
		if (text !== undefined) {
			const top = stack.at(-1);
			if (!skipping && top && TEXT_OK.has(top.name) && text.trim()) out.push(escapeText(text));
			continue;
		}
		if (closing) {
			const open = stack.pop();
			if (!open || open.name !== name) throw new Error('The SVG is not well-formed.');
			if (open.skips) skipping--;
			else if (!skipping) out.push(`</${name}>`);
			continue;
		}
		const isRoot = !stack.length;
		if (isRoot && ++roots > 1) throw new Error('The SVG is not well-formed.');
		const keep = !skipping && ELEMENTS.has(name) && (!isRoot || name === 'svg');
		if (keep) {
			let attrs = attributes(rawAttrs ?? '');
			if (isRoot) attrs = rootAttributes(attrs);
			const rendered = attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
			out.push(`<${name}${rendered}${selfClosing ? '/' : ''}>`);
		}
		if (selfClosing) continue;
		const skips = !keep && !skipping;
		if (skips) skipping++;
		stack.push({ name, skips });
	}
	if (stack.length || !roots) throw new Error('The SVG is not well-formed.');
	return out.join('');
}

/** The root keeps its viewBox; width and height come from it, and xmlns is always set. */
function rootAttributes(attrs: [string, string][]): [string, string][] {
	const viewBox = attrs.find(([k]) => k === 'viewBox')?.[1];
	const [, , w, h] = (viewBox ?? '')
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (!(w > 0 && h > 0)) throw new Error('The SVG needs a viewBox like "0 0 1000 562".');
	const rest = attrs.filter(([k]) => !['width', 'height', 'xmlns'].includes(k));
	return [
		['xmlns', 'http://www.w3.org/2000/svg'],
		...rest,
		['width', String(w)],
		['height', String(h)]
	];
}

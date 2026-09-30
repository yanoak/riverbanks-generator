import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './svg';

const wrap = (inner: string, attrs = 'viewBox="0 0 1000 500"') =>
	`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

describe('sanitizeSvg', () => {
	it('keeps drawing: shapes, paths, groups, gradients and local url() references', () => {
		const out = sanitizeSvg(
			wrap(
				'<defs><linearGradient id="sky"><stop offset="0" stop-color="#e76f51"/></linearGradient></defs>' +
					'<g stroke="#1d3557" stroke-width="4"><path d="M0 0 L10 10" fill="url(#sky)"/>' +
					'<circle cx="5" cy="5" r="2"/><rect x="1" y="1" width="3" height="3" rx="1"/></g>'
			)
		);
		expect(out).toContain('<linearGradient id="sky">');
		expect(out).toContain('<path d="M0 0 L10 10" fill="url(#sky)"/>');
		expect(out).toContain('<circle cx="5" cy="5" r="2"/>');
		expect(out).toContain('stroke-width="4"');
	});

	it('removes anything that could run or reach out', () => {
		const out = sanitizeSvg(
			wrap(
				'<script>alert(1)</script><style>@import url(http://x)</style>' +
					'<foreignObject><div>hi</div></foreignObject>' +
					'<rect onclick="alert(1)" width="1" height="1" fill="url(http://evil/x)"/>' +
					'<image href="http://evil/p.png"/><a href="http://evil"><circle r="1"/></a>' +
					'<use href="#ok"/><path style="fill:red;background:url(http://x)" d="M0 0"/>' +
					'<!-- note --><text x="1">WORDS</text>'
			)
		);
		for (const bad of [
			'script',
			'alert',
			'@import',
			'foreignObject',
			'onclick',
			'evil',
			'http://x',
			'<!--',
			'WORDS',
			'<text',
			'<a ',
			'<image',
			'<use'
		])
			expect(out, bad).not.toContain(bad);
		expect(out).toContain('<rect width="1" height="1"/>');
		expect(out).toContain('<path d="M0 0"/>');
	});

	it('sets width and height from the viewBox, so <img> knows its size', () => {
		const out = sanitizeSvg(
			wrap('<rect width="1" height="1"/>', 'viewBox="0 0 1000 562" width="10%"')
		);
		expect(out).toMatch(/^<svg [^>]*width="1000" height="562"/);
		expect(out).not.toContain('10%');
	});

	it('finds the SVG inside a chatty reply or a code fence', () => {
		const reply = 'Here is your sketch:\n```svg\n' + wrap('<circle r="3"/>') + '\n```\nEnjoy!';
		expect(sanitizeSvg(reply)).toMatch(/^<svg[^>]*>.*<circle r="3"\/><\/svg>$/s);
	});

	it('refuses input that is not one well-formed SVG with a viewBox', () => {
		expect(() => sanitizeSvg('no drawing here')).toThrow(/No <svg>/);
		expect(() => sanitizeSvg(wrap('<rect/>', ''))).toThrow(/viewBox/);
		expect(() => sanitizeSvg('<svg viewBox="0 0 1 1"><g><rect/></svg>')).toThrow(/well-formed/);
	});

	it('keeps paper-texture filters but drops unknown elements', () => {
		const out = sanitizeSvg(
			wrap(
				'<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.8"/>' +
					'<feDisplacementMap in="SourceGraphic" scale="3"/></filter>' +
					'<marquee>x</marquee><g filter="url(#paper)"><path d="M1 1"/></g>'
			)
		);
		expect(out).toContain('<feTurbulence type="fractalNoise" baseFrequency="0.8"/>');
		expect(out).toContain('filter="url(#paper)"');
		expect(out).not.toContain('marquee');
	});
});

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { fragmentToHtml, htmlToFragment } from './text';

const fragment = () => new Y.Doc().getXmlFragment('text');

describe('balloon text ↔ Y.XmlFragment', () => {
	it.each([
		['plain', '<p>psst… over here</p>'],
		['marks', '<p>WHAT A <strong>DAY</strong>! <em>really</em> <s>no</s></p>'],
		['line breaks and paragraphs', '<p>one<br>two</p><p>three</p>'],
		['escaped characters', '<p>&lt;b&gt; &amp; "q"</p>'],
		['empty', '<p></p>']
	])('%s round-trips to the same text and marks', (_name, html) => {
		const frag = fragment();
		htmlToFragment(html, frag);
		const back = fragmentToHtml(frag);
		// TipTap spells out the default alignment; everything else is identical.
		expect(back.replace(/ style="text-align: center;?"/g, '')).toBe(html);
	});

	it('keeps an explicit alignment', () => {
		const frag = fragment();
		htmlToFragment('<p style="text-align: left">a</p>', frag);
		expect(fragmentToHtml(frag)).toBe('<p style="text-align: left;">a</p>');
	});

	it('replaces what the fragment held', () => {
		const frag = fragment();
		htmlToFragment('<p>old</p>', frag);
		htmlToFragment('<p>new</p>', frag);
		expect(fragmentToHtml(frag)).toContain('>new</p>');
		expect(fragmentToHtml(frag)).not.toContain('old');
	});

	it('drops markup the editor does not support', () => {
		const frag = fragment();
		htmlToFragment('<h1>big</h1><script>x()</script><ul><li>item</li></ul>', frag);
		const html = fragmentToHtml(frag);
		expect(html).not.toMatch(/<h1|<script|<ul|<li/);
		expect(html).toContain('big');
	});
});

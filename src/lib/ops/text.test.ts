import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { fragmentToHtml, htmlToFragment } from '$lib/model/text';
import { htmlToPlain, markdownToHtml } from './text';

describe('markdownToHtml', () => {
	it('wraps lines in paragraphs', () => {
		expect(markdownToHtml('HELLO\nTHERE')).toBe('<p>HELLO</p><p>THERE</p>');
	});

	it('supports **bold** and *italic*', () => {
		expect(markdownToHtml('THE **TRICK** is *never*')).toBe(
			'<p>THE <strong>TRICK</strong> is <em>never</em></p>'
		);
	});

	it('escapes HTML so agents cannot inject markup', () => {
		expect(markdownToHtml('<img src=x onerror=alert(1)> & "q"')).toBe(
			'<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;</p>'
		);
	});

	it('keeps an empty balloon as one empty paragraph', () => {
		expect(markdownToHtml('')).toBe('<p></p>');
	});
});

describe('htmlToPlain', () => {
	it('turns stored balloon HTML back into readable text', () => {
		expect(htmlToPlain('<p>THE <strong>TRICK</strong></p><p>IS &amp; WAS</p>')).toBe(
			'THE **TRICK**\nIS & WAS'
		);
	});
});

describe('strikethrough', () => {
	it('turns ~~text~~ into <s> and back', () => {
		expect(markdownToHtml('NOT ~~ALWAYS~~ NEVER')).toBe('<p>NOT <s>ALWAYS</s> NEVER</p>');
		expect(htmlToPlain('<p>NOT <s>ALWAYS</s> NEVER</p>')).toBe('NOT ~~ALWAYS~~ NEVER');
	});

	it('survives the editor schema', () => {
		const fragment = new Y.Doc().getXmlFragment('t');
		htmlToFragment('<p><s>gone</s></p>', fragment);
		expect(fragmentToHtml(fragment)).toContain('<s>gone</s>');
	});
});

describe('accent', () => {
	it('turns ==text== into <mark> and back', () => {
		expect(markdownToHtml('==IF== WE HAD')).toBe('<p><mark>IF</mark> WE HAD</p>');
		expect(htmlToPlain('<p><mark>IF</mark> WE HAD</p>')).toBe('==IF== WE HAD');
	});

	it('survives the editor schema', () => {
		const fragment = new Y.Doc().getXmlFragment('t');
		htmlToFragment('<p>RUN THE <mark>RIVERS</mark></p>', fragment);
		expect(fragmentToHtml(fragment)).toContain('<mark>RIVERS</mark>');
	});
});

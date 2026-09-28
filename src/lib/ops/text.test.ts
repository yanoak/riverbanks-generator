import { describe, expect, it } from 'vitest';
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

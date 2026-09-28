// Balloon text for agents: a tiny markdown subset in, the editor's HTML subset out.
// Everything is escaped first, so an agent can never inject markup into the page.

const escape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lines → paragraphs; **bold**, *italic*. */
export function markdownToHtml(text: string): string {
	return text
		.split('\n')
		.map((line) => {
			const html = escape(line)
				.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
				.replace(/\*(.+?)\*/g, '<em>$1</em>');
			return `<p>${html}</p>`;
		})
		.join('');
}

/** The inverse, for describing balloons back to an agent. */
export function htmlToPlain(html: string): string {
	return html
		.replace(/<\/p>\s*<p[^>]*>/g, '\n')
		.replace(/<br\s*\/?>/g, '\n')
		.replace(/<\/?strong>/g, '**')
		.replace(/<\/?em>/g, '*')
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.trim();
}

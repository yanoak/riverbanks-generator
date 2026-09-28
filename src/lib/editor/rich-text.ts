// In-place balloon text editing with TipTap. Mounted as an attachment while a balloon is in
// text mode; when it unmounts (Esc, clicking elsewhere, switching page) the final HTML is
// committed as a single "Edit text" undo step. TipTap's own history covers typing meanwhile.

import { untrack } from 'svelte';
import { Editor as TipTap } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { textInset } from '$lib/geometry/balloon';
import { PatchCommand } from '$lib/model/commands/patch';
import type { Balloon } from '$lib/model/types';
import type { Editor } from './editor.svelte';

export function richText(editor: Editor, balloon: Balloon, selectAll: boolean) {
	// untrack: an attachment re-runs when state it reads changes, and fit() changes balloon.h —
	// tracking it would remount TipTap on every keystroke that grows the balloon (a loop).
	return (node: HTMLElement) => untrack(() => mount(editor, balloon, selectAll, node));
}

function mount(editor: Editor, balloon: Balloon, selectAll: boolean, node: HTMLElement) {
	const start = { html: balloon.html, h: balloon.h };

	/** Grow the balloon so the text fits; the text box is inset from the balloon edge. */
	const fit = () => {
		const available = node.parentElement?.clientHeight ?? 0;
		const overflow = node.offsetHeight - available;
		if (overflow > 1) balloon.h += overflow / (1 - 2 * textInset(balloon.type));
	};

	const tiptap = new TipTap({
		element: node,
		extensions: [
			StarterKit.configure({
				heading: false,
				blockquote: false,
				bulletList: false,
				orderedList: false,
				listItem: false,
				listKeymap: false,
				code: false,
				codeBlock: false,
				horizontalRule: false,
				link: false,
				dropcursor: false,
				gapcursor: false
			}),
			TextAlign.configure({ types: ['paragraph'], defaultAlignment: 'center' })
		],
		content: start.html,
		autofocus: selectAll ? 'all' : 'end',
		editorProps: { attributes: { 'aria-label': `${balloon.type} text`, spellcheck: 'false' } },
		onTransaction: () => {
			editor.textTick++;
			fit();
		}
	});
	editor.textEditor = tiptap;

	return () => {
		const html = tiptap.getHTML();
		if (editor.textEditor === tiptap) editor.textEditor = null;
		tiptap.destroy();
		// Text and any growth are one undo step. Deferred: this runs during Svelte teardown.
		queueMicrotask(() => {
			balloon.html = html;
			editor.record(PatchCommand.fromChange('Edit text', balloon, start));
		});
	};
}

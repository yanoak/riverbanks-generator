// Balloon text. The editor, the document mirror and the server all use this one extension set,
// so text written anywhere has the same schema. Conversions go through ProseMirror JSON, and
// @tiptap/html's server build supplies a DOM on Node, so none of this needs a browser.

import { getSchema } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { generateHTML, generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';

export const balloonExtensions = [
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
		gapcursor: false,
		// Undo is the comic-wide Y.UndoManager (see history/yhistory.svelte.ts).
		undoRedo: false
	}),
	TextAlign.configure({ types: ['paragraph'], defaultAlignment: 'center' })
];

export const balloonSchema = getSchema(balloonExtensions);

/** Replace the fragment's content with the given HTML (unsupported markup is dropped). */
export function htmlToFragment(html: string, fragment: Y.XmlFragment): void {
	const json = generateJSON(html, balloonExtensions);
	const write = () => {
		fragment.delete(0, fragment.length);
		prosemirrorJSONToYXmlFragment(balloonSchema, json, fragment);
	};
	if (fragment.doc) fragment.doc.transact(write);
	else write();
}

export function fragmentToHtml(fragment: Y.XmlFragment): string {
	return generateHTML(yXmlFragmentToProsemirrorJSON(fragment), balloonExtensions);
}

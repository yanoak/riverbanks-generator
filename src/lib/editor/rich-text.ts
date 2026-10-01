// In-place balloon text editing with TipTap, bound straight to the balloon's Y.XmlFragment:
// every keystroke is a Yjs change (so collaborators see it as it is typed), and ⌘Z goes to the
// comic-wide undo, which groups typing into steps. Only ySyncPlugin is used, not TipTap's
// Collaboration extension: that one destroys a shared UndoManager whenever the editor unmounts
// (see the spike in plans/2026-09-28_realtime-collaboration.plan.md).

import { untrack } from 'svelte';
import { Editor as TipTap, Extension } from '@tiptap/core';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { ySyncPlugin } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { textInset } from '$lib/geometry/balloon';
import { balloonExtensions } from '$lib/model/text';
import type { Balloon } from '$lib/model/types';
import { balloonFragment } from '$lib/model/ydoc';
import type { Editor } from './editor.svelte';

/** Sync with a fragment, and route undo/redo to the editor's history. */
const yText = (editor: Editor, fragment: Y.XmlFragment) =>
	Extension.create({
		name: 'yText',
		priority: 1000, // like Collaboration: other plugins read the sync plugin's state
		addProseMirrorPlugins: () => [ySyncPlugin(fragment)],
		addKeyboardShortcuts: () => ({
			'Mod-z': () => (editor.undo(), true),
			'Shift-Mod-z': () => (editor.redo(), true),
			'Mod-y': () => (editor.redo(), true)
		})
	});

export function richText(editor: Editor, balloon: Balloon, selectAll: boolean) {
	// untrack: an attachment re-runs when state it reads changes, and fit() changes balloon.h —
	// tracking it would remount TipTap on every keystroke that grows the balloon (a loop).
	return (node: HTMLElement) => untrack(() => mount(editor, balloon, selectAll, node));
}

function mount(editor: Editor, balloon: Balloon, selectAll: boolean, node: HTMLElement) {
	const fragment = balloonFragment(editor.doc, editor.page.id, balloon.id);
	if (!fragment) return;

	/** Grow the balloon so the text fits (same undo step as the typing that caused it). */
	const fit = () => {
		const available = node.parentElement?.clientHeight ?? 0;
		const overflow = node.offsetHeight - available;
		if (overflow <= 1) return;
		const h = balloon.h + overflow / (1 - 2 * textInset(balloon.type, balloon.roundness));
		editor.change(
			'Edit text',
			(_d, page) => {
				const b = page.balloons.find((x) => x.id === balloon.id);
				if (b) b.h = h;
			},
			{ group: true }
		);
	};

	const tiptap = new TipTap({
		element: node,
		extensions: [
			...balloonExtensions,
			yText(editor, fragment),
			// Others' carets and selections in this balloon. The whole user goes in: the extension
			// writes it to our presence state, which also carries the id avatars group by.
			...(editor.presence
				? [
						CollaborationCaret.configure({
							provider: { awareness: editor.presence.awareness },
							user: { ...editor.presence.user }
						})
					]
				: [])
		],
		autofocus: selectAll ? 'all' : 'end',
		editorProps: { attributes: { 'aria-label': `${balloon.type} text`, spellcheck: 'false' } },
		onTransaction: () => {
			editor.textTick++;
			fit();
		}
	});
	editor.textEditor = tiptap;

	return () => {
		if (editor.textEditor === tiptap) editor.textEditor = null;
		tiptap.destroy();
	};
}

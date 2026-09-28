import { tick } from 'svelte';
import type { Editor } from './editor.svelte';
import { neighbourPanel, type Direction } from './navigation';

const ARROWS: Record<string, Direction> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right'
};

function isTyping(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

async function focusPanel(id: string) {
	await tick();
	document.querySelector<SVGElement>(`[data-panel-id="${id}"]`)?.focus();
}

/**
 * Window-level shortcuts. Returns true when handled. `fit` is the current fit-to-view zoom,
 * so relative zooms start from what is on screen.
 */
export function handleShortcut(editor: Editor, e: KeyboardEvent, fit: number): boolean {
	const mod = e.metaKey || e.ctrlKey;
	const key = e.key;

	if (isTyping(e.target) && key !== 'Escape') return false;

	if (mod && key.toLowerCase() === 'z') {
		if (e.shiftKey) editor.redo();
		else editor.undo();
		return true;
	}
	if (mod && key === '0') return ((editor.zoom = null), true);
	if (mod && (key === '=' || key === '+')) return (editor.zoomBy(1.2, fit), true);
	if (mod && key === '-') return (editor.zoomBy(1 / 1.2, fit), true);
	if (mod) return false;

	if (key === 'PageDown') return (editor.goToPage(editor.pageIndex + 1), true);
	if (key === 'PageUp') return (editor.goToPage(editor.pageIndex - 1), true);

	if (key === 'm') return (editor.merge(), true);
	if (key === 'M') return (editor.split(), true);

	if (key === 'Escape') {
		editor.select({ kind: 'none' });
		(document.activeElement as HTMLElement | null)?.blur();
		document.querySelector<HTMLElement>('[data-canvas]')?.focus();
		return true;
	}

	const dir = ARROWS[key];
	if (dir && editor.selection.kind === 'panels') {
		const from = editor.selection.ids.at(-1)!;
		const next = neighbourPanel(editor.page, from, dir);
		if (!next) return true;
		if (e.shiftKey) {
			const ids = editor.selection.ids.filter((id) => id !== next);
			editor.select({ kind: 'panels', ids: [...ids, next] });
		} else {
			editor.selectPanel(next);
		}
		focusPanel(next);
		return true;
	}
	return false;
}

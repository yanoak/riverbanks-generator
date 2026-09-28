import { tick } from 'svelte';
import type { BalloonType } from '$lib/model/types';
import type { Editor } from './editor.svelte';
import { neighbourPanel, type Direction } from './navigation';

const BALLOON_KEYS: Record<string, BalloonType> = {
	s: 'speech',
	t: 'thought',
	w: 'whisper',
	k: 'shout',
	c: 'caption',
	x: 'sfx'
};

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

async function focusElement(id: string) {
	await tick();
	document.querySelector<HTMLElement>(`[data-element-id="${id}"]`)?.focus();
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

	if (editor.mode === 'text') {
		if (key !== 'Escape') return false;
		const id = editor.editingBalloonId;
		editor.stopEditing();
		if (id) focusElement(id);
		return true;
	}

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

	if (editor.mode === 'image') return imageModeKey(editor, e);

	if (key === 'Enter' && (editor.startEditing() || editor.enterImageMode())) return true;

	if (e.altKey && key === 'PageDown') return (editor.movePage(1), true);
	if (e.altKey && key === 'PageUp') return (editor.movePage(-1), true);
	if (key === 'PageDown') return (editor.goToPage(editor.pageIndex + 1), true);
	if (key === 'PageUp') return (editor.goToPage(editor.pageIndex - 1), true);

	if (key === 'Delete' || key === 'Backspace') return (editor.deleteSelection(), true);
	if (key === ']') return (editor.reorder('front'), true);
	if (key === '[') return (editor.reorder('back'), true);
	if (key === 'p') {
		const id = editor.addFreePanel();
		focusElement(id);
		return true;
	}
	const balloonType = BALLOON_KEYS[key];
	if (balloonType) {
		editor.addBalloon(balloonType); // opens text mode; TipTap takes focus
		return true;
	}

	if (key === 'm' || key === 'M') {
		if (key === 'm') editor.merge();
		else editor.split();
		// The focused polygon may have been removed; focus the merged / top-left panel.
		if (editor.selection.kind === 'panels') focusPanel(editor.selection.ids[0]);
		return true;
	}

	if (key === 'Escape') {
		editor.select({ kind: 'none' });
		(document.activeElement as HTMLElement | null)?.blur();
		document.querySelector<HTMLElement>('[data-canvas]')?.focus();
		return true;
	}

	const dir = ARROWS[key];
	if (dir && editor.movable) {
		const step = e.shiftKey ? 10 : 1;
		const [dx, dy] = { up: [0, -step], down: [0, step], left: [-step, 0], right: [step, 0] }[dir];
		editor.nudge(dx, dy);
		return true;
	}
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

function imageModeKey(editor: Editor, e: KeyboardEvent): boolean {
	const step = e.shiftKey ? 50 : 10;
	const dir = ARROWS[e.key];
	if (dir) {
		const [dx, dy] = { up: [0, -step], down: [0, step], left: [-step, 0], right: [step, 0] }[dir];
		editor.panSelectedImage(dx, dy);
		return true;
	}
	if (e.key === '+' || e.key === '=') return (editor.zoomSelectedImage(1.1), true);
	if (e.key === '-') return (editor.zoomSelectedImage(1 / 1.1), true);
	if (e.key === '0') return (editor.fitSelectedImage('fill'), true);
	if (e.key === 'Escape' || e.key === 'Enter') {
		const id = editor.imagePanelId;
		editor.exitImageMode();
		if (id) focusPanel(id);
		return true;
	}
	return false;
}

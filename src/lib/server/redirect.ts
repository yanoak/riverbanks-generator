/** A same-site path to return to after auth; anything else falls back (no open redirects). */
export function safeNext(value: string | null | undefined, fallback = '/comics'): string {
	return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
		? value
		: fallback;
}

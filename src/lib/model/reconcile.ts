// Bring a live ($state) comic in line with a fresh projection without replacing it: objects
// matched by id (pages, panels, balloons) or by key keep their identity, so components holding
// a reference keep working and Svelte only re-renders what actually changed.

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj | unknown[] => v !== null && typeof v === 'object';
const sameShape = (a: unknown, b: unknown) =>
	isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b);
const idOf = (v: unknown) => (isObject(v) && !Array.isArray(v) ? v.id : undefined);

function reconcileArray(target: unknown[], source: unknown[]) {
	const byId = new Map<unknown, unknown>();
	for (const item of target) if (idOf(item) !== undefined) byId.set(idOf(item), item);
	const next = source.map((item, i) => {
		const id = idOf(item);
		const old = id !== undefined ? byId.get(id) : idOf(target[i]) === undefined ? target[i] : null;
		if (old !== undefined && old !== null && sameShape(old, item)) {
			reconcile(old as Obj, item as Obj);
			return old;
		}
		return item;
	});
	if (next.length !== target.length || next.some((item, i) => item !== target[i])) {
		target.splice(0, target.length, ...next);
	}
}

export function reconcile(target: object, source: object): void {
	if (Array.isArray(target) && Array.isArray(source)) return reconcileArray(target, source);
	const t = target as Obj;
	const s = source as Obj;
	for (const [key, value] of Object.entries(s)) {
		const current = t[key];
		if (sameShape(current, value)) reconcile(current as Obj, value as Obj);
		else if (!Object.is(current, value)) t[key] = value;
	}
	for (const key of Object.keys(t)) if (!(key in s)) delete t[key];
}

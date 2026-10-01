<!--
  The story network as a force-directed graph. d3-force lays it out, d3-zoom pans and zooms,
  d3-drag moves nodes; Svelte draws the SVG. Nodes are focusable buttons (Enter or Space selects).
-->
<script lang="ts" module>
	export const STORY_COLOURS = ['#2E6B67', '#B9862B', '#B4543A', '#6E8B55', '#8A6A48', '#5B6C8F'];
</script>

<script lang="ts">
	import {
		forceCenter,
		forceCollide,
		forceLink,
		forceManyBody,
		forceSimulation,
		type Simulation,
		type SimulationLinkDatum,
		type SimulationNodeDatum
	} from 'd3-force';
	import { untrack } from 'svelte';
	import { drag } from 'd3-drag';
	import { select } from 'd3-selection';
	import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
	import {
		DEFAULT_FOCUS,
		ageIn,
		aliveIn,
		portraitFor,
		type Link,
		type Person,
		type Story
	} from '$lib/network/canon';

	let {
		people,
		links,
		stories,
		year,
		selected = $bindable(null)
	}: {
		people: Person[];
		links: Link[];
		stories: Story[];
		year: number | null;
		selected: string | null;
	} = $props();

	type Node = SimulationNodeDatum & { person: Person };
	type Edge = SimulationLinkDatum<Node> & { link: Link };

	const colourOf = $derived.by(() => {
		const order = [...stories].sort((a, b) => a.order - b.order).map((s) => s.id);
		return (p: Person) =>
			p.kind === 'institution'
				? '#6b6b63'
				: STORY_COLOURS[Math.max(0, order.indexOf(p.stories[0] ?? '')) % STORY_COLOURS.length];
	});

	const DISTANCE: Record<Link['type'], number> = {
		family: 90,
		inspired: 150,
		friends: 140,
		work: 150,
		member: 130,
		companion: 70
	};

	let svg = $state<SVGSVGElement>();
	let width = $state(800);
	let height = $state(560);
	let transform = $state<ZoomTransform>(zoomIdentity);
	let frame = $state(0);
	let hovered = $state<string | null>(null);
	let nodes: Node[] = $state.raw([]);
	let edges: Edge[] = $state.raw([]);
	let sim: Simulation<Node, Edge> | undefined;
	let fitted = false;
	let zoomer: ZoomBehavior<SVGSVGElement, unknown> | undefined;
	// A plain cache between rebuilds of the simulation, never rendered from.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const positions = new Map<string, { x: number; y: number }>();

	// Rebuild the simulation when the visible set changes, keeping where nodes already were.
	$effect(() => {
		const ps = people;
		const ls = links;
		// Read and write the rendered arrays only outside tracking: reading them here would make
		// this effect depend on what it writes, and loop.
		untrack(() => {
			for (const n of nodes) positions.set(n.person.id, { x: n.x ?? 0, y: n.y ?? 0 });
			sim?.stop();
		});
		const nextNodes: Node[] = ps.map((person) => ({ person, ...(positions.get(person.id) ?? {}) }));
		const byId = new Map(nextNodes.map((n) => [n.person.id, n]));
		const nextEdges: Edge[] = ls.map((link) => ({
			link,
			source: byId.get(link.source)!,
			target: byId.get(link.target)!
		}));
		sim = forceSimulation(nextNodes)
			.force(
				'link',
				forceLink<Node, Edge>(nextEdges).distance((e) => DISTANCE[e.link.type])
			)
			.force('charge', forceManyBody().strength(-520))
			.force('center', forceCenter(0, 0))
			.force('collide', forceCollide(48))
			.on('tick', () => {
				frame++;
				// Fit once per layout, as soon as it has mostly settled; after that the view is the user's.
				if (!fitted && sim && sim.alpha() < 0.12) {
					fitted = true;
					fit();
				}
			});
		fitted = false;
		nodes = nextNodes;
		edges = nextEdges;
		return () => sim?.stop();
	});

	$effect(() => {
		if (!svg) return;
		zoomer = zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.3, 3])
			.on('zoom', (e) => (transform = e.transform));
		select(svg).call(zoomer).on('dblclick.zoom', null);
		// Start centred on the layout's origin, before the first fit.
		select(svg).call(zoomer.transform, zoomIdentity.translate(width / 2, height / 2));
	});

	/** Fit everything in view. */
	export function fit() {
		if (!svg || !zoomer || !nodes.length) return;
		const xs = nodes.map((n) => n.x ?? 0);
		const ys = nodes.map((n) => n.y ?? 0);
		const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
		const k = Math.min(2, 0.85 * Math.min(width / (x1 - x0 + 120), height / (y1 - y0 + 120)));
		const t = zoomIdentity
			.translate(width / 2, height / 2)
			.scale(k)
			.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
		select(svg).call(zoomer.transform, t);
	}

	export function zoomBy(k: number) {
		if (svg && zoomer) select(svg).call(zoomer.scaleBy, k);
	}

	function draggable(el: SVGGElement, node: Node) {
		const behaviour = drag<SVGGElement, unknown>()
			.on('start', (e) => {
				if (!e.active) sim?.alphaTarget(0.25).restart();
				node.fx = node.x;
				node.fy = node.y;
			})
			.on('drag', (e) => {
				node.fx = e.x;
				node.fy = e.y;
			})
			.on('end', (e) => {
				if (!e.active) sim?.alphaTarget(0);
				node.fx = null;
				node.fy = null;
			});
		// d3-drag reads the pointer in the zoomed group's coordinates via the subject.
		behaviour.subject(() => ({ x: node.x ?? 0, y: node.y ?? 0 }));
		select(el).call(behaviour);
	}

	// A fresh snapshot of the coordinates on every tick: d3 mutates its own objects in place.
	const view = $derived.by(() => {
		void frame;
		return {
			nodes: nodes.map((n) => ({ n, person: n.person, x: n.x ?? 0, y: n.y ?? 0 })),
			edges: edges.map((e) => {
				const s = e.source as Node;
				const t = e.target as Node;
				return {
					link: e.link,
					s: s.person,
					t: t.person,
					x1: s.x ?? 0,
					y1: s.y ?? 0,
					x2: t.x ?? 0,
					y2: t.y ?? 0
				};
			})
		};
	});

	const focus = $derived(hovered ?? selected);
	const near = $derived.by(() => {
		if (!focus) return null;
		// Built fresh inside the derived, never mutated afterwards.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const s = new Set([focus]);
		for (const l of links) {
			if (l.source === focus) s.add(l.target);
			if (l.target === focus) s.add(l.source);
		}
		return s;
	});

	function label(p: Person): string {
		if (year === null) return p.name;
		const age = ageIn(p, year);
		if (p.died !== null && year > p.died) return `${p.name} †${p.died}`;
		return age !== null ? `${p.name} · ${age}` : p.name;
	}

	function onkey(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			selected = selected === id ? null : id;
		}
	}

	const DASH: Record<Link['type'], string | undefined> = {
		family: undefined,
		inspired: '7 5',
		friends: undefined,
		work: '12 6',
		member: '2 5',
		companion: undefined
	};
	const STROKE: Record<Link['type'], number> = {
		family: 2.4,
		inspired: 2,
		friends: 2,
		work: 1.8,
		member: 1.6,
		companion: 1.2
	};
</script>

<div class="relative h-full w-full" bind:clientWidth={width} bind:clientHeight={height}>
	<!-- Zoom keys for the focused graph; the nodes are the interactive elements. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		bind:this={svg}
		{width}
		{height}
		class="block touch-none select-none"
		role="group"
		aria-label="Story network graph"
		onclick={(e) => {
			if (e.target === svg) selected = null;
		}}
		onkeydown={(e) => {
			if (e.key === '+' || e.key === '=') zoomBy(1.25);
			else if (e.key === '-') zoomBy(0.8);
			else if (e.key === '0') fit();
			else if (e.key === 'Escape') selected = null;
		}}
	>
		<g transform={transform.toString()}>
			{#each view.edges as e (e.link.id)}
				{@const lit = !near || e.link.source === focus || e.link.target === focus}
				{@const live = year === null || (aliveIn(e.s, year) && aliveIn(e.t, year))}
				<line
					x1={e.x1}
					y1={e.y1}
					x2={e.x2}
					y2={e.y2}
					stroke={e.link.type === 'inspired' ? '#B9862B' : 'currentColor'}
					class="text-stone-500"
					stroke-width={STROKE[e.link.type]}
					stroke-dasharray={DASH[e.link.type]}
					opacity={(lit ? 0.85 : 0.12) * (live ? 1 : 0.35)}
				/>
				{#if focus && lit}
					<text
						x={(e.x1 + e.x2) / 2}
						y={(e.y1 + e.y2) / 2 - 4}
						text-anchor="middle"
						class="fill-stone-700 text-[10px]"
						paint-order="stroke"
						stroke="white"
						stroke-width="3">{e.link.label}{e.link.year ? ` · ${e.link.year}` : ''}</text
					>
				{/if}
			{/each}
			{#each view.nodes as v (v.person.id)}
				{@const p = v.person}
				{@const lit = !near || near.has(p.id)}
				{@const live = year === null || aliveIn(p, year)}
				{@const face = portraitFor(p, year)}
				{@const r = face?.url ? 22 : p.kind === 'person' ? 13 : p.kind === 'institution' ? 15 : 9}
				<g
					use:draggable={v.n}
					transform="translate({v.x},{v.y})"
					role="button"
					tabindex="0"
					aria-label="{p.name}, {p.kind}"
					aria-pressed={selected === p.id}
					data-node={p.id}
					class="cursor-pointer outline-none [&:focus-visible>.ring]:opacity-100"
					opacity={(lit ? 1 : 0.25) * (live ? 1 : 0.35)}
					onclick={() => (selected = selected === p.id ? null : p.id)}
					onkeydown={(e) => onkey(e, p.id)}
					onpointerenter={() => (hovered = p.id)}
					onpointerleave={() => (hovered = null)}
				>
					<circle class="opacity-0 ring" r={r + 6} fill="none" stroke="#0ea5e9" stroke-width="2" />
					{#if selected === p.id}
						<circle r={r + 5} fill="none" stroke={colourOf(p)} stroke-width="2.5" />
					{/if}
					{#if p.kind === 'institution'}
						<rect
							x={-r}
							y={-r}
							width={r * 2}
							height={r * 2}
							transform="rotate(45)"
							fill="white"
							stroke={colourOf(p)}
							stroke-width="2.5"
						/>
					{:else if face?.url}
						{@const f = face.focus ?? DEFAULT_FOCUS}
						{@const w = 2 * r * f.zoom}
						{@const h = (w * (face.height ?? 2)) / (face.width ?? 3)}
						<!-- The face fills the circle as a pattern, so the node's box (focus ring, hit area) is the circle. -->
						<defs>
							<pattern
								id="face-{p.id}"
								patternUnits="userSpaceOnUse"
								x={-r}
								y={-r}
								width={2 * r}
								height={2 * r}
							>
								<rect width={2 * r} height={2 * r} fill={colourOf(p)} />
								<image
									href={face.url}
									x={r - f.x * w}
									y={r - f.y * h}
									width={w}
									height={h}
									preserveAspectRatio="none"
								/>
							</pattern>
						</defs>
						<circle {r} fill="url(#face-{p.id})" />
						<circle {r} fill="none" stroke={colourOf(p)} stroke-width="3" />
					{:else}
						<circle
							{r}
							fill={p.kind === 'person' ? colourOf(p) : 'white'}
							stroke={colourOf(p)}
							stroke-width="2.5"
						/>
					{/if}
					<text
						y={r + 15}
						text-anchor="middle"
						class="fill-stone-900 text-[12px] font-medium"
						paint-order="stroke"
						stroke="white"
						stroke-width="4">{label(p)}</text
					>
				</g>
			{/each}
		</g>
	</svg>
</div>

import { syntaxTree } from "@codemirror/language";
import {
	Compartment,
	type Extension,
	Facet,
	RangeSetBuilder,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";

export type TitleEntry = { title: string; refId: string };

export type AutoLinkConfig = {
	titles: TitleEntry[];
	orgId: string;
	teamId: string;
	excludeRefIds?: string[];
};

const autoLinkFacet = Facet.define<AutoLinkConfig, AutoLinkConfig | null>({
	combine: (values) => values[0] ?? null,
});

/** Node types where auto-link detection is skipped */
const EXCLUDED_NODE_TYPES = new Set([
	"FencedCode",
	"CodeBlock",
	"InlineCode",
	"Link",
	"AutoLink",
	"Image",
]);

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAutoLinkDecorations(view: EditorView): DecorationSet {
	const config = view.state.facet(autoLinkFacet);
	if (!config?.titles?.length) return Decoration.none;

	const exclude = new Set(config.excludeRefIds ?? []);
	const titles = config.titles.filter((e) => !exclude.has(e.refId));
	if (!titles.length) return Decoration.none;

	// Sort longest-first for greedy matching
	const sorted = [...titles].sort((a, b) => b.title.length - a.title.length);
	const lookup = new Map<string, TitleEntry>();
	for (const e of sorted) {
		const lower = e.title.toLowerCase();
		if (!lookup.has(lower)) lookup.set(lower, e);
	}

	const pattern = new RegExp(
		sorted.map((e) => escapeRegExp(e.title)).join("|"),
		"gi",
	);

	const allMatches: { from: number; to: number; entry: TitleEntry }[] = [];

	for (const { from, to } of view.visibleRanges) {
		// Collect excluded intervals (code, links, etc.)
		const excludedRanges: { from: number; to: number }[] = [];
		syntaxTree(view.state).iterate({
			from,
			to,
			enter(node) {
				if (EXCLUDED_NODE_TYPES.has(node.name)) {
					excludedRanges.push({ from: node.from, to: node.to });
					return false; // Don't descend into excluded nodes
				}
			},
		});

		// Scan visible text for title matches
		const text = view.state.doc.sliceString(from, to);
		pattern.lastIndex = 0;
		for (;;) {
			const match = pattern.exec(text);
			if (!match) break;
			const matchFrom = from + match.index;
			const matchTo = matchFrom + match[0].length;

			// Skip if inside an excluded node
			let inExcluded = false;
			for (const r of excludedRanges) {
				if (matchFrom < r.to && matchTo > r.from) {
					inExcluded = true;
					break;
				}
			}
			if (inExcluded) continue;

			const entry = lookup.get(match[0].toLowerCase());
			if (entry) allMatches.push({ from: matchFrom, to: matchTo, entry });
		}
	}

	// Sort by from position, remove overlapping matches (keep first)
	allMatches.sort((a, b) => a.from - b.from);
	const builder = new RangeSetBuilder<Decoration>();
	let lastTo = -1;
	for (const { from, to, entry } of allMatches) {
		if (from >= lastTo) {
			const href = `/org/${config.orgId}/team/${config.teamId}/pages/${entry.refId}`;
			builder.add(
				from,
				to,
				Decoration.mark({
					class: "cm-md-autolink",
					attributes: { "data-href": href },
				}),
			);
			lastTo = to;
		}
	}

	return builder.finish();
}

const autoLinkPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildAutoLinkDecorations(view);
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.transactions.some((tr) => tr.reconfigured)
			) {
				this.decorations = buildAutoLinkDecorations(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations },
);

const autoLinkStyles = EditorView.baseTheme({
	".cm-md-autolink": {
		color: "var(--color-primary, #3b82f6)",
		textDecoration: "underline",
		cursor: "pointer",
	},
});

const autoLinkClickHandler = EditorView.domEventHandlers({
	click(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const span = target.closest<HTMLElement>("[data-href]");
		if (span?.dataset.href) {
			event.preventDefault();
			// Programmatic SPA navigation via history API
			// TanStack Router listens to popstate events
			window.history.pushState(null, "", span.dataset.href);
			window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
		}
	},
});

/**
 * Compartment for dynamically reconfiguring auto-link titles.
 * Put this in the editor state and call `reconfigure` when titles change.
 */
export const autoLinkConfigCompartment = new Compartment();

/** Static extensions (plugin + styles + click handler) — add once to the editor state */
export function autoLinkStaticExtensions(): Extension {
	return [autoLinkPlugin, autoLinkStyles, autoLinkClickHandler];
}

/** Configurable extension — wrap in `autoLinkConfigCompartment.of(...)` */
export function autoLinkConfig(config: AutoLinkConfig): Extension {
	return autoLinkFacet.of(config);
}

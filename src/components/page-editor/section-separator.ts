import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { sectionRangesField } from "./section-state";

/**
 * Widget rendered between sections as a visual divider.
 */
class SectionSeparatorWidget extends WidgetType {
	toDOM(): HTMLElement {
		const el = document.createElement("div");
		el.className = "cm-section-separator";
		el.setAttribute("aria-hidden", "true");
		return el;
	}
	ignoreEvent(): boolean {
		return true;
	}
	eq(): boolean {
		return true;
	}
}

const separatorWidget = Decoration.widget({
	widget: new SectionSeparatorWidget(),
	block: true,
	side: 0,
});

/**
 * ViewPlugin that places separator widgets between sections.
 */
const sectionSeparatorPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildSeparatorDecorations(view);
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.state.field(sectionRangesField) !==
					update.startState.field(sectionRangesField)
			) {
				this.decorations = buildSeparatorDecorations(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations },
);

function buildSeparatorDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const ranges = view.state.field(sectionRangesField);

	for (let i = 0; i < ranges.length - 1; i++) {
		const current = ranges[i];
		const next = ranges[i + 1];
		// Place separator at the midpoint of the gap between sections
		const gapPos = current.to + 1; // position after section body, inside the \n\n gap
		if (gapPos < next.from && gapPos <= view.state.doc.length) {
			builder.add(gapPos, gapPos, separatorWidget);
		}
	}

	return builder.finish();
}

/**
 * Styles for the section separator widget.
 */
const separatorStyles = EditorView.baseTheme({
	".cm-section-separator": {
		display: "block",
		height: "1px",
		margin: "0.75rem 0",
		background: "var(--color-border, rgba(127,127,127,0.3))",
		cursor: "default",
		pointerEvents: "none",
	},
});

export function sectionSeparator() {
	return [sectionRangesField, sectionSeparatorPlugin, separatorStyles];
}

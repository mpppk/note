import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { moveSectionEffect, sectionRangesField } from "./section-state";

/**
 * Widget rendered between sections as a visual divider with reorder buttons.
 * `sectionIndex` is the 0-based index of the section ABOVE this separator.
 */
class SectionSeparatorWidget extends WidgetType {
	constructor(private readonly sectionIndex: number) {
		super();
	}

	eq(other: SectionSeparatorWidget): boolean {
		return this.sectionIndex === other.sectionIndex;
	}

	toDOM(view: EditorView): HTMLElement {
		const el = document.createElement("div");
		el.className = "cm-section-separator";

		const btns = document.createElement("div");
		btns.className = "cm-section-separator-btns";
		btns.style.opacity = "0";
		btns.style.transition = "opacity 0.15s";

		const upBtn = document.createElement("button");
		upBtn.type = "button";
		upBtn.title = "セクションを上に移動";
		upBtn.textContent = "↑";
		upBtn.className = "cm-section-separator-btn";
		upBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Move the section BELOW this separator UP (swap with section above)
			view.dispatch({
				effects: moveSectionEffect.of({
					fromIndex: this.sectionIndex + 1,
					toIndex: this.sectionIndex,
				}),
			});
		});

		const downBtn = document.createElement("button");
		downBtn.type = "button";
		downBtn.title = "セクションを下に移動";
		downBtn.textContent = "↓";
		downBtn.className = "cm-section-separator-btn";
		downBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Move the section ABOVE this separator DOWN (swap with section below)
			view.dispatch({
				effects: moveSectionEffect.of({
					fromIndex: this.sectionIndex,
					toIndex: this.sectionIndex + 1,
				}),
			});
		});

		btns.appendChild(upBtn);
		btns.appendChild(downBtn);
		el.appendChild(btns);

		// Show/hide buttons on hover (mouse) or touch
		el.addEventListener("mouseenter", () => {
			btns.style.opacity = "1";
		});
		el.addEventListener("mouseleave", () => {
			btns.style.opacity = "0";
		});
		// Touch: toggle visibility on tap on the separator bar
		el.addEventListener(
			"touchstart",
			(e) => {
				e.stopPropagation();
				const isVisible = btns.style.opacity === "1";
				btns.style.opacity = isVisible ? "0" : "1";
			},
			{ passive: true },
		);

		return el;
	}

	ignoreEvent(): boolean {
		// CodeMirror won't process events on this widget (e.g., cursor placement)
		// Buttons still fire because they have direct DOM listeners.
		return true;
	}
}

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
		const gapPos = current.to + 1;
		if (gapPos < next.from && gapPos <= view.state.doc.length) {
			builder.add(
				gapPos,
				gapPos,
				Decoration.widget({
					widget: new SectionSeparatorWidget(i),
					block: true,
					side: 0,
				}),
			);
		}
	}

	return builder.finish();
}

/**
 * Styles for the section separator widget and its reorder buttons.
 */
const separatorStyles = EditorView.baseTheme({
	".cm-section-separator": {
		display: "flex",
		alignItems: "center",
		position: "relative",
		height: "1px",
		margin: "0.75rem 0",
		background: "var(--color-border, rgba(127,127,127,0.3))",
		cursor: "default",
	},
	".cm-section-separator-btns": {
		position: "absolute",
		right: "0.5rem",
		top: "-0.875rem",
		display: "flex",
		gap: "0.25rem",
		background: "var(--color-background, #fff)",
		borderRadius: "4px",
		padding: "1px 2px",
		boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
	},
	".cm-section-separator-btn": {
		background: "none",
		border: "none",
		cursor: "pointer",
		color: "var(--color-muted-foreground, #6b7280)",
		padding: "0.25rem 0.4rem",
		fontSize: "0.75rem",
		lineHeight: "1.25",
		borderRadius: "3px",
		// Touch-friendly minimum tap target (Phase 8)
		minWidth: "1.75rem",
		minHeight: "1.75rem",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		touchAction: "manipulation",
	},
});

export function sectionSeparator() {
	return [sectionRangesField, sectionSeparatorPlugin, separatorStyles];
}

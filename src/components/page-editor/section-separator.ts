import {
	type EditorState,
	RangeSetBuilder,
	StateField,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
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
		// Prevent the editor from gaining focus when clicking the separator bar
		el.addEventListener("mousedown", (e) => {
			e.preventDefault();
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

function buildSeparatorDecorations(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const ranges = state.field(sectionRangesField);

	for (let i = 0; i < ranges.length - 1; i++) {
		const current = ranges[i];
		const next = ranges[i + 1];
		const gapPos = current.to + 1;
		if (gapPos < next.from && gapPos <= state.doc.length) {
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
 * StateField that provides block separator decorations between sections.
 * Block decorations must be provided via StateField + EditorView.decorations,
 * not via ViewPlugin (which only supports inline decorations).
 */
const sectionSeparatorField = StateField.define<DecorationSet>({
	create(state) {
		return buildSeparatorDecorations(state);
	},
	update(decorations, tr) {
		if (
			tr.docChanged ||
			tr.state.field(sectionRangesField) !==
				tr.startState.field(sectionRangesField)
		) {
			return buildSeparatorDecorations(tr.state);
		}
		return decorations.map(tr.changes);
	},
	provide: (f) => EditorView.decorations.from(f),
});

/**
 * Styles for the section separator widget and its reorder buttons.
 */
const separatorStyles = EditorView.baseTheme({
	".cm-section-separator": {
		display: "flex",
		alignItems: "center",
		position: "relative",
		height: "calc(1.5rem + 1px)",
		background:
			"linear-gradient(transparent calc(50% - 0.5px), var(--color-border, rgba(127,127,127,0.3)) calc(50% - 0.5px), var(--color-border, rgba(127,127,127,0.3)) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
		cursor: "default",
	},
	".cm-section-separator-btns": {
		position: "absolute",
		right: "0.5rem",
		top: "50%",
		transform: "translateY(-50%)",
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

/**
 * Prevents the cursor from entering the "\n\n" separator gap between sections.
 * Without this, ArrowDown from the end of section A lands on the second '\n'
 * (the separator widget line), where Enter inserts into the gap rather than
 * section A — so the content is never saved.
 *
 * The atomic range covers [gapPos, next.from) — only the second '\n' of the
 * separator — leaving the cursor free at current.to (end of section A body).
 */
const sectionGapAtomicRanges = EditorView.atomicRanges.of((view) => {
	const builder = new RangeSetBuilder<Decoration>();
	const ranges = view.state.field(sectionRangesField);
	for (let i = 0; i < ranges.length - 1; i++) {
		const current = ranges[i];
		const next = ranges[i + 1];
		// atomicRanges blocks positions P where from < P < to (boundaries excluded).
		// Using [current.to, next.from) blocks gapPos (= current.to + 1) while
		// leaving current.to itself accessible (end of section A body).
		if (current.to < next.from) {
			builder.add(current.to, next.from, Decoration.mark({}));
		}
	}
	return builder.finish();
});

export function sectionSeparator() {
	return [
		sectionRangesField,
		sectionSeparatorField,
		separatorStyles,
		sectionGapAtomicRanges,
	];
}

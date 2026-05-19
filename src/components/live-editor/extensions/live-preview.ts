import { syntaxTree } from "@codemirror/language";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

/**
 * Determines whether a syntax node (or its range) contains the cursor.
 * Used to decide whether to show raw markdown or rendered decoration.
 */
function cursorInRange(view: EditorView, from: number, to: number): boolean {
	const { state } = view;
	for (const range of state.selection.ranges) {
		if (range.from <= to && range.to >= from) {
			return true;
		}
	}
	return false;
}

// Decoration marks for various markdown elements
const hiddenMark = Decoration.replace({});

const boldMark = Decoration.mark({ class: "cm-md-bold" });
const italicMark = Decoration.mark({ class: "cm-md-italic" });
const inlineCodeMark = Decoration.mark({ class: "cm-md-inline-code" });
const linkTextMark = Decoration.mark({ class: "cm-md-link-text" });
const heading1Mark = Decoration.mark({ class: "cm-md-heading1" });
const heading2Mark = Decoration.mark({ class: "cm-md-heading2" });
const heading3Mark = Decoration.mark({ class: "cm-md-heading3" });
const heading4Mark = Decoration.mark({ class: "cm-md-heading4" });
const heading5Mark = Decoration.mark({ class: "cm-md-heading5" });
const heading6Mark = Decoration.mark({ class: "cm-md-heading6" });
const codeBlockMark = Decoration.mark({ class: "cm-md-code-block" });
const listBulletMark = Decoration.mark({ class: "cm-md-list-bullet" });
const listOrderedMark = Decoration.mark({ class: "cm-md-list-ordered" });
const listItemMark = Decoration.mark({ class: "cm-md-list-item" });

const headingMarks = [
	heading1Mark,
	heading2Mark,
	heading3Mark,
	heading4Mark,
	heading5Mark,
	heading6Mark,
];

/**
 * Build decorations for the visible range based on the markdown syntax tree.
 */
function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const decorations: { from: number; to: number; deco: Decoration }[] = [];

	for (const { from, to } of view.visibleRanges) {
		syntaxTree(view.state).iterate({
			from,
			to,
			enter(nodeRef) {
				processNode(view, nodeRef, decorations);
			},
		});
	}

	// Sort decorations by start position (required by RangeSetBuilder)
	decorations.sort((a, b) => a.from - b.from || a.to - b.to);
	for (const { from, to, deco } of decorations) {
		if (from < to) {
			builder.add(from, to, deco);
		}
	}

	return builder.finish();
}

function processNode(
	view: EditorView,
	nodeRef: SyntaxNodeRef,
	decorations: { from: number; to: number; deco: Decoration }[],
) {
	const { name } = nodeRef;

	// --- Headings ---
	if (name.startsWith("ATXHeading")) {
		processHeading(view, nodeRef.node, decorations);
		return;
	}

	// --- Emphasis (Bold / Italic) ---
	if (name === "Emphasis") {
		processEmphasis(view, nodeRef.node, decorations, false);
		return;
	}
	if (name === "StrongEmphasis") {
		processEmphasis(view, nodeRef.node, decorations, true);
		return;
	}

	// --- Inline Code ---
	if (name === "InlineCode") {
		processInlineCode(view, nodeRef.node, decorations);
		return;
	}

	// --- Links ---
	if (name === "Link") {
		processLink(view, nodeRef.node, decorations);
		return;
	}

	// --- Code Blocks ---
	if (name === "FencedCode") {
		processCodeBlock(view, nodeRef.node, decorations);
		return;
	}

	// --- Lists ---
	if (name === "ListItem") {
		processListItem(view, nodeRef.node, decorations);
	}
}

function processHeading(
	view: EditorView,
	node: SyntaxNode,
	decorations: { from: number; to: number; deco: Decoration }[],
) {
	const { from, to } = node;
	if (cursorInRange(view, from, to)) return;

	// Find the HeaderMark child (the `#` characters)
	const markNode = node.getChild("HeaderMark");
	if (!markNode) return;

	// Determine heading level
	const markText = view.state.doc.sliceString(markNode.from, markNode.to);
	const level = markText.length; // number of # chars

	// Hide the `# ` prefix (including trailing space)
	const hideEnd = Math.min(markNode.to + 1, to); // +1 for space after #
	decorations.push({ from: markNode.from, to: hideEnd, deco: hiddenMark });

	// Apply heading style to the rest
	const headingDeco = headingMarks[level - 1] ?? heading6Mark;
	decorations.push({ from: hideEnd, to, deco: headingDeco });
}

function processEmphasis(
	view: EditorView,
	node: SyntaxNode,
	decorations: { from: number; to: number; deco: Decoration }[],
	strong: boolean,
) {
	const { from, to } = node;
	if (cursorInRange(view, from, to)) return;

	const markerLen = strong ? 2 : 1;
	const mark = strong ? boldMark : italicMark;

	// Hide opening markers
	decorations.push({ from, to: from + markerLen, deco: hiddenMark });
	// Hide closing markers
	decorations.push({ from: to - markerLen, to, deco: hiddenMark });
	// Style the content
	decorations.push({ from: from + markerLen, to: to - markerLen, deco: mark });
}

function processInlineCode(
	view: EditorView,
	node: SyntaxNode,
	decorations: { from: number; to: number; deco: Decoration }[],
) {
	const { from, to } = node;
	if (cursorInRange(view, from, to)) return;

	// Find CodeMark children (backticks)
	const marks = node.getChildren("CodeMark");
	if (marks.length >= 2) {
		const openMark = marks[0];
		const closeMark = marks[marks.length - 1];
		// Hide backticks
		decorations.push({
			from: openMark.from,
			to: openMark.to,
			deco: hiddenMark,
		});
		decorations.push({
			from: closeMark.from,
			to: closeMark.to,
			deco: hiddenMark,
		});
		// Style content
		decorations.push({
			from: openMark.to,
			to: closeMark.from,
			deco: inlineCodeMark,
		});
	}
}

function processLink(
	view: EditorView,
	node: SyntaxNode,
	decorations: { from: number; to: number; deco: Decoration }[],
) {
	const { from, to } = node;
	if (cursorInRange(view, from, to)) return;

	// Structure: [ LinkMark "[" ] [ ... link text ... ] [ LinkMark "]" ] [ URL "(" ... ")" ]
	const linkMarks = node.getChildren("LinkMark");
	const url = node.getChild("URL");

	if (linkMarks.length >= 2 && url) {
		const openBracket = linkMarks[0];
		const closeBracket = linkMarks[1];

		// Hide `[`
		decorations.push({
			from: openBracket.from,
			to: openBracket.to,
			deco: hiddenMark,
		});
		// Style link text
		decorations.push({
			from: openBracket.to,
			to: closeBracket.from,
			deco: linkTextMark,
		});
		// Hide `](url)`
		decorations.push({
			from: closeBracket.from,
			to,
			deco: hiddenMark,
		});
	}
}

function processCodeBlock(
	view: EditorView,
	node: SyntaxNode,
	decorations: { from: number; to: number; deco: Decoration }[],
) {
	const { from, to } = node;
	if (cursorInRange(view, from, to)) return;

	// Find the CodeMark nodes (opening ``` and closing ```)
	const marks = node.getChildren("CodeMark");
	if (marks.length >= 2) {
		const openFence = marks[0];
		const closeFence = marks[marks.length - 1];

		// Get line boundaries for fence lines
		const openLine = view.state.doc.lineAt(openFence.from);
		const closeLine = view.state.doc.lineAt(closeFence.from);

		// Hide the opening fence line (but not the newline — plugins can't replace line breaks)
		decorations.push({
			from: openLine.from,
			to: openLine.to,
			deco: hiddenMark,
		});
		// Hide the closing fence line
		if (closeLine.from > openLine.from) {
			decorations.push({
				from: closeLine.from,
				to: closeLine.to,
				deco: hiddenMark,
			});
		}
		// Style the code content
		const contentFrom = openLine.to + 1;
		const contentTo = closeLine.from - 1;
		if (contentFrom < contentTo) {
			decorations.push({
				from: contentFrom,
				to: contentTo,
				deco: codeBlockMark,
			});
		}
	}
}

function processListItem(
	view: EditorView,
	node: SyntaxNode,
	decorations: { from: number; to: number; deco: Decoration }[],
) {
	const { from, to } = node;
	if (cursorInRange(view, from, to)) return;

	// Find the ListMark child (the `- ` or `1. ` marker)
	const markNode = node.getChild("ListMark");
	if (!markNode) return;

	// Detect if it's an ordered list by checking parent
	const isOrdered = node.parent?.name === "OrderedList";
	const itemMark = isOrdered ? listOrderedMark : listBulletMark;

	// Style the marker (muted color for ordered; styled bullet for unordered)
	decorations.push({ from: markNode.from, to: markNode.to, deco: itemMark });

	// Style the content of the list item (after the marker + space)
	const spaceAfterMark =
		view.state.doc.sliceString(markNode.to, markNode.to + 1) === " " ? 1 : 0;
	const contentFrom = markNode.to + spaceAfterMark;
	if (contentFrom < to) {
		decorations.push({ from: contentFrom, to, deco: listItemMark });
	}
}

/**
 * ViewPlugin that manages live preview decorations.
 * Rebuilds decorations on cursor movement or document changes.
 */
const livePreviewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.selectionSet || update.viewportChanged) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

/**
 * Styles for the live preview decorations
 */
const livePreviewStyles = EditorView.baseTheme({
	".cm-md-heading1": {
		fontSize: "1.875rem",
		fontWeight: "700",
		lineHeight: "2.25rem",
	},
	".cm-md-heading2": {
		fontSize: "1.5rem",
		fontWeight: "600",
		lineHeight: "2rem",
	},
	".cm-md-heading3": {
		fontSize: "1.25rem",
		fontWeight: "600",
		lineHeight: "1.75rem",
	},
	".cm-md-heading4": {
		fontSize: "1.125rem",
		fontWeight: "600",
		lineHeight: "1.5rem",
	},
	".cm-md-heading5": {
		fontSize: "1rem",
		fontWeight: "600",
		lineHeight: "1.5rem",
	},
	".cm-md-heading6": {
		fontSize: "0.875rem",
		fontWeight: "600",
		lineHeight: "1.25rem",
	},
	".cm-md-bold": {
		fontWeight: "700",
	},
	".cm-md-italic": {
		fontStyle: "italic",
	},
	".cm-md-inline-code": {
		backgroundColor: "rgba(127, 127, 127, 0.15)",
		borderRadius: "3px",
		padding: "1px 4px",
		fontFamily: "ui-monospace, monospace",
		fontSize: "0.85em",
	},
	".cm-md-link-text": {
		color: "var(--color-primary, #3b82f6)",
		textDecoration: "underline",
		cursor: "pointer",
	},
	".cm-md-code-block": {
		backgroundColor: "rgba(127, 127, 127, 0.1)",
		fontFamily: "ui-monospace, monospace",
		fontSize: "0.85em",
		borderRadius: "4px",
		display: "block",
		padding: "0.5rem",
	},
	".cm-md-list-marker": {
		color: "var(--color-muted-foreground, #6b7280)",
	},
	".cm-md-list-bullet": {
		color: "transparent",
		display: "inline-block",
		width: "1em",
		position: "relative",
		"&::before": {
			content: '"•"',
			color: "var(--color-muted-foreground, #6b7280)",
			position: "absolute",
			left: "0",
		},
	},
	".cm-md-list-ordered": {
		color: "var(--color-muted-foreground, #6b7280)",
		fontWeight: "500",
	},
	".cm-md-list-item": {
		display: "inline",
	},
});

/**
 * The complete live preview extension.
 */
export function livePreview(): Extension {
	return [livePreviewPlugin, livePreviewStyles];
}

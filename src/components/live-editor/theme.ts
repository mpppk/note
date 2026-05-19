import { EditorView } from "@codemirror/view";

/**
 * Base theme shared between light and dark modes.
 * Uses CSS variables so it adapts to the page's dark mode class.
 */
export const baseTheme = EditorView.theme({
	"&": {
		fontSize: "0.875rem",
		lineHeight: "1.625",
	},
	".cm-content": {
		fontFamily: "inherit",
		padding: "0.5rem 0",
	},
	".cm-line": {
		padding: "0 0.5rem",
	},
	"&.cm-focused": {
		outline: "none",
	},
	".cm-cursor": {
		borderLeftColor: "var(--cm-cursor, currentColor)",
	},
	".cm-selectionBackground": {
		background: "var(--cm-selection, rgba(59, 130, 246, 0.2)) !important",
	},
	"&.cm-focused .cm-selectionBackground": {
		background:
			"var(--cm-selection-focused, rgba(59, 130, 246, 0.3)) !important",
	},
	".cm-scroller": {
		overflow: "auto",
	},
});

/**
 * CSS variables for light mode
 */
export const lightTheme = EditorView.theme(
	{
		"&": {
			"--cm-cursor": "#000",
			"--cm-selection": "rgba(59, 130, 246, 0.2)",
			"--cm-selection-focused": "rgba(59, 130, 246, 0.3)",
		},
	},
	{ dark: false },
);

/**
 * CSS variables for dark mode
 */
export const darkTheme = EditorView.theme(
	{
		"&": {
			"--cm-cursor": "#fff",
			"--cm-selection": "rgba(99, 160, 255, 0.25)",
			"--cm-selection-focused": "rgba(99, 160, 255, 0.35)",
		},
	},
	{ dark: true },
);

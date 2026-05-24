import { autocompletion } from "@codemirror/autocomplete";
import {
	defaultKeymap,
	history,
	historyKeymap,
	insertNewlineAndIndent,
} from "@codemirror/commands";
import {
	insertNewlineContinueMarkup,
	markdown,
	markdownLanguage,
} from "@codemirror/lang-markdown";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	keymap,
	placeholder as placeholderExt,
} from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { baseTheme, darkTheme, lightTheme } from "./theme";

type UseEditorOptions = {
	doc: string;
	onChange?: (doc: string) => void;
	onBlur?: (doc: string) => void;
	extensions?: Extension[];
	placeholder?: string;
	dark?: boolean;
};

export function useEditor(options: UseEditorOptions) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const [mounted, setMounted] = useState(false);

	const onChangeRef = useRef(options.onChange);
	onChangeRef.current = options.onChange;
	const onBlurRef = useRef(options.onBlur);
	onBlurRef.current = options.onBlur;

	// Capture initial values in refs to avoid triggering re-creation
	const initialDocRef = useRef(options.doc);
	const extensionsRef = useRef(options.extensions);
	const placeholderRef = useRef(options.placeholder);
	extensionsRef.current = options.extensions;
	placeholderRef.current = options.placeholder;

	const dark = options.dark;

	useEffect(() => {
		if (!containerRef.current) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				onChangeRef.current?.(update.state.doc.toString());
			}
			if (update.focusChanged && !update.view.hasFocus) {
				onBlurRef.current?.(update.state.doc.toString());
			}
		});

		const themeExtension = dark ? darkTheme : lightTheme;

		const state = EditorState.create({
			doc: initialDocRef.current,
			extensions: [
				// Mobile: never return false from Enter handler — returning false lets
				// the browser's native beforeinput fire, bypassing CodeMirror state.
				Prec.high(
					keymap.of([
						{
							key: "Enter",
							run: (view) => {
								if (insertNewlineContinueMarkup(view)) {
									return true;
								}
								insertNewlineAndIndent(view);
								return true;
							},
						},
					]),
				),
				keymap.of([...defaultKeymap, ...historyKeymap]),
				history(),
				drawSelection(),
				highlightActiveLine(),
				markdown({ base: markdownLanguage }),
				autocompletion(),
				baseTheme,
				themeExtension,
				updateListener,
				...(placeholderRef.current
					? [placeholderExt(placeholderRef.current)]
					: []),
				...(extensionsRef.current ?? []),
			],
		});

		const view = new EditorView({
			state,
			parent: containerRef.current,
		});

		viewRef.current = view;
		setMounted(true);

		return () => {
			view.destroy();
			viewRef.current = null;
			setMounted(false);
		};
	}, [dark]);

	// Sync external doc changes into the editor
	const lastExternalDoc = useRef(options.doc);
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		if (options.doc === lastExternalDoc.current) return;
		lastExternalDoc.current = options.doc;

		const currentDoc = view.state.doc.toString();
		if (currentDoc !== options.doc) {
			view.dispatch({
				changes: { from: 0, to: currentDoc.length, insert: options.doc },
			});
		}
	}, [options.doc]);

	const focus = useCallback(() => {
		viewRef.current?.focus();
	}, []);

	return { containerRef, viewRef, mounted, focus };
}

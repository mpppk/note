import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef } from "react";
import { livePreview } from "#/components/live-editor/extensions/live-preview";
import {
	baseTheme,
	darkTheme,
	lightTheme,
} from "#/components/live-editor/theme";
import { sectionSeparator } from "./section-separator";
import { mergeSections, sectionRangesField, splitDoc } from "./section-state";

type SectionInput = {
	id: string;
	body: string;
};

type PageEditorProps = {
	sections: SectionInput[];
	onSave: (sectionId: string, body: string) => Promise<void>;
	dark?: boolean;
	placeholder?: string;
};

export function PageEditor({
	sections,
	onSave,
	dark = false,
	placeholder,
}: PageEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const sectionsRef = useRef(sections);
	const onSaveRef = useRef(onSave);
	const placeholderRef = useRef(placeholder);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastSavedRef = useRef<Map<string, string>>(new Map());

	// Keep mutable refs up to date each render
	sectionsRef.current = sections;
	onSaveRef.current = onSave;
	placeholderRef.current = placeholder;

	const saveChanges = useCallback((view: EditorView) => {
		const ranges = view.state.field(sectionRangesField);
		const docStr = view.state.doc.toString();
		const split = splitDoc(docStr, ranges);
		for (const { id, body } of split) {
			const last = lastSavedRef.current.get(id);
			if (last !== undefined && last !== body) {
				lastSavedRef.current.set(id, body);
				onSaveRef.current(id, body).catch(console.error);
			}
		}
	}, []);

	// Recreate editor only when dark mode changes
	useEffect(() => {
		if (!containerRef.current) return;

		const { doc, ranges } = mergeSections(sectionsRef.current);
		lastSavedRef.current = new Map(
			sectionsRef.current.map((s) => [s.id, s.body]),
		);

		const updateListener = EditorView.updateListener.of((update) => {
			if (!update.docChanged) return;
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => saveChanges(update.view), 1500);
		});

		const state = EditorState.create({
			doc,
			extensions: [
				markdown(),
				livePreview(),
				sectionSeparator(),
				EditorView.lineWrapping,
				dark ? darkTheme : lightTheme,
				baseTheme,
				updateListener,
				EditorView.domEventHandlers({
					blur(_, view) {
						if (debounceRef.current) {
							clearTimeout(debounceRef.current);
							debounceRef.current = null;
						}
						saveChanges(view);
					},
				}),
				sectionRangesField.init(() => ranges),
			],
		});

		const view = new EditorView({ state, parent: containerRef.current });
		viewRef.current = view;

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
			view.destroy();
			viewRef.current = null;
		};
	}, [dark, saveChanges]);

	// Sync external section changes (e.g. after server re-fetch)
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const { doc: newDoc } = mergeSections(sections);
		const currentDoc = view.state.doc.toString();
		if (currentDoc === newDoc) return;

		// Don't overwrite if local edits are ahead of what's saved
		const allSynced = sections.every(
			(s) =>
				lastSavedRef.current.has(s.id) &&
				lastSavedRef.current.get(s.id) === s.body,
		);
		if (allSynced) return;

		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: newDoc },
		});
		lastSavedRef.current = new Map(sections.map((s) => [s.id, s.body]));
	}, [sections]);

	return <div ref={containerRef} className="page-editor" />;
}

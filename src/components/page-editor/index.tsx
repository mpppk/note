import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	autoLinkConfig,
	autoLinkStaticExtensions,
	type TitleEntry,
} from "#/components/live-editor/extensions/auto-link";
import {
	createHeadingAutocompleteCompartment,
	headingAutocompleteConfig,
	headingAutocompleteExtension,
} from "#/components/live-editor/extensions/heading-autocomplete";
import { livePreview } from "#/components/live-editor/extensions/live-preview";
import {
	baseTheme,
	darkTheme,
	lightTheme,
} from "#/components/live-editor/theme";
import { sectionSeparator } from "./section-separator";
import {
	mergeSections,
	moveSectionEffect,
	sectionRangesField,
	setSectionRangesEffect,
	splitDoc,
} from "./section-state";

type SectionInput = {
	id: string;
	body: string;
};

type PageEditorProps = {
	sections: SectionInput[];
	onSave: (sectionId: string, body: string) => Promise<void>;
	/** Called when section order changes (for API persistence) */
	onReorder?: (orderedSectionIds: string[]) => void;
	dark?: boolean;
	placeholder?: string;
	/** Page titles for auto-link detection */
	titles?: TitleEntry[];
	orgId?: string;
	teamId?: string;
	/** Page IDs to exclude from auto-link (e.g. the current page) */
	excludeRefIds?: string[];
};

export function PageEditor({
	sections,
	onSave,
	onReorder,
	dark = false,
	placeholder,
	titles,
	orgId,
	teamId,
	excludeRefIds,
}: PageEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const sectionsRef = useRef(sections);
	const onSaveRef = useRef(onSave);
	const onReorderRef = useRef(onReorder);
	const placeholderRef = useRef(placeholder);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastSavedRef = useRef<Map<string, string>>(new Map());
	// Stable ref for the compartment (same instance across renders)
	const autoLinkCompartmentRef = useRef(new Compartment());
	const headingACCompartmentRef = useRef(
		createHeadingAutocompleteCompartment(),
	);

	// Save status for UI feedback
	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
		"idle",
	);
	const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const setSaveStatusRef = useRef(setSaveStatus);
	setSaveStatusRef.current = setSaveStatus;

	// Keep mutable refs up to date each render
	sectionsRef.current = sections;
	onSaveRef.current = onSave;
	onReorderRef.current = onReorder;
	placeholderRef.current = placeholder;

	const saveChanges = useCallback((view: EditorView) => {
		const ranges = view.state.field(sectionRangesField);
		const docStr = view.state.doc.toString();
		const split = splitDoc(docStr, ranges);
		const promises: Promise<void>[] = [];
		for (const { id, body } of split) {
			const last = lastSavedRef.current.get(id);
			if (last !== undefined && last !== body) {
				lastSavedRef.current.set(id, body);
				promises.push(onSaveRef.current(id, body));
			}
		}
		if (promises.length > 0) {
			setSaveStatusRef.current("saving");
			if (saveStatusTimeoutRef.current)
				clearTimeout(saveStatusTimeoutRef.current);
			Promise.all(promises)
				.then(() => {
					setSaveStatusRef.current("saved");
					saveStatusTimeoutRef.current = setTimeout(
						() => setSaveStatusRef.current("idle"),
						2000,
					);
				})
				.catch(console.error);
		}
	}, []);

	// Recreate editor only when dark mode changes
	useEffect(() => {
		if (!containerRef.current) return;

		const { doc, ranges } = mergeSections(sectionsRef.current);
		lastSavedRef.current = new Map(
			sectionsRef.current.map((s) => [s.id, s.body]),
		);

		const alComp = autoLinkCompartmentRef.current;
		const haComp = headingACCompartmentRef.current;

		const updateListener = EditorView.updateListener.of((update) => {
			// Handle moveSectionEffect: reorder sections and update doc
			for (const tr of update.transactions) {
				// Skip if this is already the reorder result transaction (prevents loop)
				if (tr.effects.some((e) => e.is(setSectionRangesEffect))) continue;
				for (const effect of tr.effects) {
					if (effect.is(moveSectionEffect)) {
						const { fromIndex, toIndex } = effect.value;
						const ranges = update.view.state.field(sectionRangesField);
						const docStr = update.view.state.doc.toString();
						const sects = splitDoc(docStr, ranges);
						if (
							fromIndex < 0 ||
							toIndex < 0 ||
							fromIndex >= sects.length ||
							toIndex >= sects.length ||
							fromIndex === toIndex
						)
							continue;
						// Move section
						const newSects = [...sects];
						const [moved] = newSects.splice(fromIndex, 1);
						newSects.splice(toIndex, 0, moved);
						const { doc: newDoc, ranges: newRanges } = mergeSections(newSects);
						// Update lastSaved map to reflect new order
						lastSavedRef.current = new Map(newSects.map((s) => [s.id, s.body]));
						update.view.dispatch({
							changes: {
								from: 0,
								to: update.view.state.doc.length,
								insert: newDoc,
							},
							effects: setSectionRangesEffect.of(newRanges),
						});
						onReorderRef.current?.(newSects.map((s) => s.id));
					}
				}
			}

			if (!update.docChanged) return;
			// Skip auto-save when the change is a section reorder
			if (
				update.transactions.some((tr) =>
					tr.effects.some((e) => e.is(setSectionRangesEffect)),
				)
			)
				return;
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
				// Auto-link: static extensions always present; config in compartment
				autoLinkStaticExtensions(),
				alComp.of([]),
				// Heading autocomplete
				headingAutocompleteExtension(haComp, []),
			],
		});

		const view = new EditorView({ state, parent: containerRef.current });
		viewRef.current = view;

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
			if (saveStatusTimeoutRef.current) {
				clearTimeout(saveStatusTimeoutRef.current);
				saveStatusTimeoutRef.current = null;
			}
			view.destroy();
			viewRef.current = null;
		};
	}, [dark, saveChanges]);

	// Reconfigure auto-link when titles or routing context changes
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const alComp = autoLinkCompartmentRef.current;
		if (titles?.length && orgId && teamId) {
			view.dispatch({
				effects: alComp.reconfigure(
					autoLinkConfig({ titles, orgId, teamId, excludeRefIds }),
				),
			});
		} else {
			view.dispatch({ effects: alComp.reconfigure([]) });
		}
	}, [titles, orgId, teamId, excludeRefIds]);

	// Reconfigure heading autocomplete when titles change
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: headingAutocompleteConfig(
				headingACCompartmentRef.current,
				titles ?? [],
			),
		});
	}, [titles]);

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

	return (
		<div className="relative">
			<div ref={containerRef} className="page-editor" />
			{saveStatus !== "idle" && (
				<div className="absolute top-1 right-2 text-xs text-muted-foreground pointer-events-none select-none">
					{saveStatus === "saving" ? "Saving…" : "Saved"}
				</div>
			)}
		</div>
	);
}

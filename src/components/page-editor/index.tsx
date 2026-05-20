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
	embedSelectEffect,
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
	SECTION_SEPARATOR,
	findFirstEmbeddedH1H2,
	mergeSections,
	moveSectionEffect,
	sectionRangesField,
	setSectionRangesEffect,
	splitDoc,
	startsWithH1H2,
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
	/** Called to insert a new section immediately after the given section. Returns the new section ID. */
	onAddSectionAfter?: (afterSectionId: string, body: string) => Promise<string>;
	/** Called to delete a section (used when merging heading sections). */
	onDeleteSection?: (sectionId: string) => Promise<void>;
	/** Called when a heading autocomplete selection embeds a page. */
	onEmbedSelect?: (
		afterSectionId: string,
		embedPageId: string,
	) => Promise<void>;
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
	onAddSectionAfter,
	onDeleteSection,
	onEmbedSelect,
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
	const onAddSectionAfterRef = useRef(onAddSectionAfter);
	const onDeleteSectionRef = useRef(onDeleteSection);
	const onEmbedSelectRef = useRef(onEmbedSelect);
	const reconciliationInProgressRef = useRef(false);
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
	onAddSectionAfterRef.current = onAddSectionAfter;
	onDeleteSectionRef.current = onDeleteSection;
	onEmbedSelectRef.current = onEmbedSelect;
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

	const reconcileStructure = useCallback(async (view: EditorView, deleteWhitespaceOnly = false) => {
		if (reconciliationInProgressRef.current) return;
		if (!onAddSectionAfterRef.current && !onDeleteSectionRef.current) return;
		reconciliationInProgressRef.current = true;
		try {
			// ── Phase 1: Splits (last → first to avoid offset drift) ──
			for (
				let i = view.state.field(sectionRangesField).length - 1;
				i >= 0;
				i--
			) {
				const ranges = view.state.field(sectionRangesField);
				const range = ranges[i];
				const body = view.state.doc.sliceString(range.from, range.to);

				const hashPos = findFirstEmbeddedH1H2(body);
				if (hashPos === -1 || !onAddSectionAfterRef.current) continue;

				const afterBody = body.slice(hashPos);

				const newId = await onAddSectionAfterRef.current(range.id, afterBody);
				lastSavedRef.current.set(newId, afterBody);
				// lastSavedRef for range.id intentionally NOT updated here so
				// saveChanges detects the diff and saves the trimmed beforeBody.

				// Single atomic dispatch: insert '\n' to form '\n\n' separator + update ranges.
				// setSectionRangesEffect takes priority over mapPos in sectionRangesField.update.
				const insertAt = range.from + hashPos - 1; // position of existing '\n'
				const beforeEnd = range.from + hashPos - 1;
				const afterStart = range.from + hashPos + 1; // +1 for the inserted '\n'
				const newRanges = [
					...ranges.slice(0, i),
					{ id: range.id, from: range.from, to: beforeEnd },
					{ id: newId, from: afterStart, to: range.to + 1 },
					...ranges.slice(i + 1),
				];
				view.dispatch({
					changes: { from: insertAt, to: insertAt, insert: "\n" },
					effects: setSectionRangesEffect.of(newRanges),
				});
			}

			// ── Phase 2: Merges (last → first) ──
			let ranges = view.state.field(sectionRangesField);
			const docStr = view.state.doc.toString();

			for (let i = ranges.length - 1; i >= 1; i--) {
				const range = ranges[i];
				const body = docStr.slice(range.from, range.to);
				const lastBody = lastSavedRef.current.get(range.id) ?? "";

				if (!startsWithH1H2(lastBody) || startsWithH1H2(body)) continue;
				if (!onDeleteSectionRef.current) continue;

				const prevRange = ranges[i - 1];
				const newRanges = [
					...ranges.slice(0, i - 1),
					{ id: prevRange.id, from: prevRange.from, to: range.to },
					...ranges.slice(i + 1),
				];
				// No doc change needed — content is already contiguous in the editor.
				// Await delete before dispatching so that any saveChanges-triggered
				// query re-fetch sees the section as already deleted in the DB.
				await onDeleteSectionRef.current(range.id);
				lastSavedRef.current.delete(range.id);
				view.dispatch({ effects: setSectionRangesEffect.of(newRanges) });
				ranges = view.state.field(sectionRangesField);
			}
			// ── Phase 3: Delete whitespace-only sections (blur only) ──
			if (deleteWhitespaceOnly && onDeleteSectionRef.current) {
				let ranges = view.state.field(sectionRangesField);

				for (let i = ranges.length - 1; i >= 0; i--) {
					ranges = view.state.field(sectionRangesField);
					if (ranges.length <= 1) break;

					const range = ranges[i];
					const body = view.state.doc.sliceString(range.from, range.to);
					if (!/^\s*$/.test(body)) continue;

					await onDeleteSectionRef.current(range.id);
					lastSavedRef.current.delete(range.id);

					const deleteFrom =
						i === 0 ? range.from : range.from - SECTION_SEPARATOR.length;
					const deleteTo =
						i === 0 ? range.to + SECTION_SEPARATOR.length : range.to;
					const deleteLen = deleteTo - deleteFrom;

					const newRanges = [
						...ranges.slice(0, i),
						...ranges.slice(i + 1).map((r) => ({
							...r,
							from: r.from - deleteLen,
							to: r.to - deleteLen,
						})),
					];

					view.dispatch({
						changes: { from: deleteFrom, to: deleteTo, insert: "" },
						effects: setSectionRangesEffect.of(newRanges),
					});
				}
			}
		} finally {
			reconciliationInProgressRef.current = false;
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
					if (effect.is(embedSelectEffect)) {
						const { refId, lineFrom } = effect.value;
						const ranges = tr.startState.field(sectionRangesField);
						const section = ranges.find(
							(r) => r.from <= lineFrom && lineFrom <= r.to,
						);
						if (section) {
							onEmbedSelectRef
								.current?.(section.id, refId)
								.catch(console.error);
						}
					}
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
			debounceRef.current = setTimeout(async () => {
				await reconcileStructure(update.view);
				saveChanges(update.view);
			}, 1500);
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
					mousedown(event) {
						// Prevent focus when clicking in editor chrome (scroller, gutter, etc.)
						// but not on actual text content or interactive widgets.
						const target = event.target as Element;
						if (
							!target.closest(".cm-content") &&
							!target.closest(".cm-section-separator-btn")
						) {
							event.preventDefault();
							return true;
						}
					},
					blur(_, view) {
						if (debounceRef.current) {
							clearTimeout(debounceRef.current);
							debounceRef.current = null;
						}
						reconcileStructure(view, true)
							.then(() => saveChanges(view))
							.catch(console.error);
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
	}, [dark, saveChanges, reconcileStructure]);

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

		const { doc: newDoc, ranges: newRanges } = mergeSections(sections);
		const currentDoc = view.state.doc.toString();
		if (currentDoc === newDoc) return;

		// Don't overwrite if local edits are ahead of what's saved
		const allSynced = sections.every(
			(s) =>
				lastSavedRef.current.has(s.id) &&
				lastSavedRef.current.get(s.id) === s.body,
		);
		if (allSynced) return;

		// Include setSectionRangesEffect so sectionRangesField is updated atomically.
		// Without it, mapPos maps all positions to 0/docLength for a full-doc replace,
		// leaving all section ranges as {from:0, to:docLength} which causes false splits.
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: newDoc },
			effects: setSectionRangesEffect.of(newRanges),
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

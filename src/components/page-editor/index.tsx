import { defaultKeymap, insertNewlineAndIndent } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { yCollab } from "y-codemirror.next";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
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
import { authClient } from "#/lib/auth-client";
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
	pageId: string;
	sections: SectionInput[];
	onSave: (sectionId: string, body: string) => Promise<void>;
	onReorder?: (orderedSectionIds: string[]) => void;
	onAddSectionAfter?: (afterSectionId: string, body: string) => Promise<string>;
	onDeleteSection?: (sectionId: string) => Promise<void>;
	onEmbedSelect?: (
		afterSectionId: string,
		embedPageId: string,
	) => Promise<void>;
	dark?: boolean;
	placeholder?: string;
	titles?: TitleEntry[];
	orgId?: string;
	teamId?: string;
	excludeRefIds?: string[];
};

function generateColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	}
	return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`;
}

export function PageEditor({
	pageId,
	sections,
	onSave: _onSave,
	onReorder,
	onAddSectionAfter: _onAddSectionAfter,
	onDeleteSection: _onDeleteSection,
	onEmbedSelect,
	dark = false,
	placeholder: _placeholder,
	titles,
	orgId,
	teamId,
	excludeRefIds,
}: PageEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const providerRef = useRef<WebsocketProvider | null>(null);
	const sectionsRef = useRef(sections);
	const onReorderRef = useRef(onReorder);
	const onEmbedSelectRef = useRef(onEmbedSelect);
	const autoLinkCompartmentRef = useRef(new Compartment());
	const headingACCompartmentRef = useRef(
		createHeadingAutocompleteCompartment(),
	);
	const titlesRef = useRef(titles);

	const [isSynced, setIsSynced] = useState(false);

	const { data: session } = authClient.useSession();

	sectionsRef.current = sections;
	onReorderRef.current = onReorder;
	onEmbedSelectRef.current = onEmbedSelect;
	titlesRef.current = titles;

	// Update awareness user info when session becomes available
	useEffect(() => {
		const provider = providerRef.current;
		if (!provider || !session?.user) return;
		provider.awareness.setLocalStateField("user", {
			name: session.user.name ?? "Anonymous",
			color: generateColor(session.user.id),
		});
	}, [session]);

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

	// Create Yjs provider + CodeMirror editor together
	// Recreates when dark mode or pageId changes
	useEffect(() => {
		if (!containerRef.current) return;

		// --- Yjs setup ---
		const ydoc = new Y.Doc();
		const ytext = ydoc.getText("markdown");
		const undoManager = new Y.UndoManager(ytext);

		const wsProtocol =
			typeof location !== "undefined" && location.protocol === "https:"
				? "wss:"
				: "ws:";
		const wsBase = `${wsProtocol}//${typeof location !== "undefined" ? location.host : "localhost"}`;
		const provider = new WebsocketProvider(
			wsBase,
			`api/collab/${pageId}`,
			ydoc,
		);
		providerRef.current = provider;

		const syncHandler = (synced: boolean) => {
			if (synced) setIsSynced(true);
		};
		provider.on("sync", syncHandler);

		// --- CodeMirror setup ---
		const { ranges } = mergeSections(sectionsRef.current);

		const alComp = autoLinkCompartmentRef.current;
		const haComp = headingACCompartmentRef.current;

		const updateListener = EditorView.updateListener.of((update) => {
			for (const tr of update.transactions) {
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
						const newSects = [...sects];
						const [moved] = newSects.splice(fromIndex, 1);
						newSects.splice(toIndex, 0, moved);
						const { doc: newDoc, ranges: newRanges } = mergeSections(newSects);
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
		});

		const state = EditorState.create({
			// Start empty — yCollab populates the doc once Yjs syncs from the server
			doc: "",
			extensions: [
				// Mobile: markdownKeymap returns false for headings; consume Enter explicitly
				// so mobile beforeinput isn't handled natively and bypasses Yjs state.
				Prec.high(
					keymap.of([
						{
							key: "Enter",
							run: (view) => {
								const line = view.state.doc.lineAt(
									view.state.selection.main.from,
								);
								if (/^#{1,6} /.test(line.text)) {
									return insertNewlineAndIndent(view);
								}
								return false;
							},
						},
					]),
				),
				keymap.of(defaultKeymap),
				markdown(),
				livePreview(),
				EditorView.lineWrapping,
				dark ? darkTheme : lightTheme,
				baseTheme,
				updateListener,
				EditorView.domEventHandlers({
					mousedown(event) {
						const target = event.target as Element;
						if (!target.closest(".cm-content")) {
							event.preventDefault();
							return true;
						}
					},
				}),
				sectionRangesField.init(() => ranges),
				autoLinkStaticExtensions(),
				alComp.of([]),
				headingAutocompleteExtension(haComp, titlesRef.current ?? []),
				yCollab(ytext, provider.awareness, { undoManager }),
			],
		});

		const view = new EditorView({ state, parent: containerRef.current });
		viewRef.current = view;

		return () => {
			provider.off("sync", syncHandler);
			provider.destroy();
			ydoc.destroy();
			view.destroy();
			viewRef.current = null;
			providerRef.current = null;
			setIsSynced(false);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dark, pageId]);

	return (
		<div className="relative">
			<div ref={containerRef} className="page-editor" />
			{!isSynced && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded">
					<span className="text-sm text-muted-foreground animate-pulse">
						接続中…
					</span>
				</div>
			)}
		</div>
	);
}

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveEditor } from "#/components/live-editor";
import type { TitleEntry } from "#/lib/remark-autolink";

type Props = {
	body: string;
	onSave: (body: string) => Promise<void> | void;
	titles: TitleEntry[];
	orgId: string;
	teamId: string;
	excludeRefIds?: string[];
	saving?: boolean;
};

export function InlineBlockEditor({
	body,
	onSave,
	titles: _titles,
	orgId: _orgId,
	teamId: _teamId,
	excludeRefIds: _excludeRefIds,
	saving,
}: Props) {
	const [draft, setDraft] = useState(body);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastSavedRef = useRef(body);

	useEffect(() => {
		setDraft(body);
		lastSavedRef.current = body;
	}, [body]);

	const save = useCallback(
		(text: string) => {
			if (text !== lastSavedRef.current) {
				lastSavedRef.current = text;
				void onSave(text);
			}
		},
		[onSave],
	);

	const handleChange = useCallback(
		(text: string) => {
			setDraft(text);
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				save(text);
			}, 1500);
		},
		[save],
	);

	const handleBlur = useCallback(
		(text: string) => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
			save(text);
		},
		[save],
	);

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	// Detect dark mode
	const [dark, setDark] = useState(false);
	useEffect(() => {
		const root = document.documentElement;
		const observer = new MutationObserver(() => {
			setDark(root.classList.contains("dark"));
		});
		setDark(root.classList.contains("dark"));
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	return (
		<div className="relative">
			<LiveEditor
				doc={draft}
				onChange={handleChange}
				onBlur={handleBlur}
				placeholder="(empty — click to edit)"
				dark={dark}
			/>
			{saving && (
				<div className="absolute top-1 right-2 text-xs text-muted-foreground">
					Saving…
				</div>
			)}
		</div>
	);
}

import type { Extension } from "@codemirror/state";
import { useMemo } from "react";
import { livePreview } from "./extensions/live-preview";
import { useEditor } from "./use-editor";

type LiveEditorProps = {
	doc: string;
	onChange?: (doc: string) => void;
	onBlur?: (doc: string) => void;
	placeholder?: string;
	dark?: boolean;
	className?: string;
	extensions?: Extension[];
};

export function LiveEditor({
	doc,
	onChange,
	onBlur,
	placeholder,
	dark,
	className,
	extensions: extraExtensions,
}: LiveEditorProps) {
	const extensions = useMemo(
		() => [livePreview(), ...(extraExtensions ?? [])],
		[extraExtensions],
	);

	const { containerRef } = useEditor({
		doc,
		onChange,
		onBlur,
		placeholder,
		dark,
		extensions,
	});

	return (
		<div
			ref={containerRef}
			className={`live-editor min-h-[4rem] rounded-md border border-border bg-background ${className ?? ""}`}
		/>
	);
}

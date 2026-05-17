import { useEffect, useRef, useState } from "react";
import { Markdown } from "#/components/markdown";
import { Textarea } from "#/components/ui/textarea";
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
	titles,
	orgId,
	teamId,
	excludeRefIds,
	saving,
}: Props) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(body);
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (!editing) setDraft(body);
	}, [body, editing]);

	useEffect(() => {
		if (editing && ref.current) {
			ref.current.focus();
			const len = ref.current.value.length;
			ref.current.setSelectionRange(len, len);
		}
	}, [editing]);

	async function commit() {
		setEditing(false);
		if (draft !== body) {
			await onSave(draft);
		}
	}

	if (editing) {
		return (
			<div className="relative">
				<Textarea
					ref={ref}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => {
						void commit();
					}}
					className="min-h-32 font-mono text-sm"
				/>
				{saving && (
					<div className="absolute top-1 right-2 text-xs text-muted-foreground">
						Saving…
					</div>
				)}
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setEditing(true)}
			className="block w-full text-left rounded-sm px-2 py-1 -mx-2 cursor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			aria-label="Edit block"
		>
			{body.trim() ? (
				<Markdown
					body={body}
					titles={titles}
					orgId={orgId}
					teamId={teamId}
					excludeRefIds={excludeRefIds}
				/>
			) : (
				<span className="text-sm text-muted-foreground italic">
					(empty — click to edit)
				</span>
			)}
		</button>
	);
}

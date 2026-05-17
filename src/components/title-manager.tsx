import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

type Props = {
	titles: string[];
	onAdd: (title: string) => Promise<void> | void;
	onRemove: (title: string) => Promise<void> | void;
	canRemoveLast?: boolean;
};

export function TitleManager({
	titles,
	onAdd,
	onRemove,
	canRemoveLast,
}: Props) {
	const [adding, setAdding] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleAdd() {
		if (!adding.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await onAdd(adding.trim());
			setAdding("");
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function handleRemove(t: string) {
		setBusy(true);
		setError(null);
		try {
			await onRemove(t);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	const canRemove = canRemoveLast || titles.length > 1;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-1.5">
				{titles.map((t, i) => (
					<span
						key={t}
						className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-sm"
					>
						{i === 0 && (
							<span className="text-xs text-muted-foreground">primary</span>
						)}
						<span>{t}</span>
						{canRemove && (
							<button
								type="button"
								onClick={() => handleRemove(t)}
								disabled={busy}
								className="text-muted-foreground hover:text-destructive disabled:opacity-50"
								aria-label={`Remove title ${t}`}
							>
								×
							</button>
						)}
					</span>
				))}
			</div>
			<div className="flex gap-2">
				<Input
					type="text"
					placeholder="alias を追加"
					value={adding}
					onChange={(e) => setAdding(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleAdd();
					}}
					disabled={busy}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleAdd}
					disabled={busy || !adding.trim()}
				>
					Add
				</Button>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}

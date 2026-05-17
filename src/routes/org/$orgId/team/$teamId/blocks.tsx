import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { getSession } from "#/server/auth";
import { createBlock, listBlocks } from "#/server/notes";
import { listMembers } from "#/server/orgs";

export const Route = createFileRoute("/org/$orgId/team/$teamId/blocks")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
	},
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.prefetchQuery({
				queryKey: ["blocks", params.teamId],
				queryFn: () =>
					listBlocks({ data: { orgId: params.orgId, teamId: params.teamId } }),
			}),
			context.queryClient.prefetchQuery({
				queryKey: ["org-members", params.orgId],
				queryFn: () => listMembers({ data: { orgId: params.orgId } }),
			}),
		]);
	},
	component: BlocksPage,
});

function BlocksPage() {
	const { orgId, teamId } = Route.useParams();
	const qc = useQueryClient();

	const { data: blocks } = useQuery({
		queryKey: ["blocks", teamId],
		queryFn: () => listBlocks({ data: { orgId, teamId } }),
	});

	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const [filter, setFilter] = useState("");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);

	const { mutate: handleCreate, isPending: creating } = useMutation({
		mutationFn: () =>
			createBlock({ data: { orgId, teamId, title: title.trim(), body } }),
		onSuccess: () => {
			setTitle("");
			setBody("");
			setError(null);
			qc.invalidateQueries({ queryKey: ["blocks", teamId] });
			qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
		},
		onError: (e: Error) => setError(e.message),
	});

	const filtered = (blocks ?? []).filter((b) => {
		if (!filter.trim()) return true;
		const f = filter.toLowerCase();
		return (
			b.titles.some((t) => t.toLowerCase().includes(f)) ||
			b.body.toLowerCase().includes(f)
		);
	});

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
				<Link to="/orgs" className="hover:text-foreground transition-colors">
					Organizations
				</Link>
				<span>/</span>
				<Link
					to="/org/$orgId"
					params={{ orgId }}
					className="hover:text-foreground transition-colors"
				>
					{org?.name ?? orgId}
				</Link>
				<span>/</span>
				<Link
					to="/org/$orgId/team/$teamId"
					params={{ orgId, teamId }}
					className="hover:text-foreground transition-colors"
				>
					Team
				</Link>
				<span>/</span>
				<span className="font-medium text-foreground">Blocks</span>
			</div>

			<h1 className="mb-6 text-2xl font-bold">Blocks</h1>

			<div className="mb-4">
				<Input
					type="text"
					placeholder="タイトル・本文で絞り込み"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
				/>
			</div>

			<ul className="mb-8 space-y-2">
				{filtered.map((b) => (
					<li key={b.id}>
						<Link
							to="/org/$orgId/team/$teamId/blocks/$blockId"
							params={{ orgId, teamId, blockId: b.id }}
							className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted no-underline text-foreground"
						>
							<div className="font-medium">{b.titles[0] ?? "(no title)"}</div>
							{b.titles.length > 1 && (
								<div className="text-xs text-muted-foreground mt-0.5">
									aliases: {b.titles.slice(1).join(", ")}
								</div>
							)}
							{b.body && (
								<div className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
									{b.body}
								</div>
							)}
						</Link>
					</li>
				))}
				{filtered.length === 0 && (
					<li className="text-muted-foreground text-sm">No blocks.</li>
				)}
			</ul>

			<Card>
				<CardHeader>
					<CardTitle>Create Block</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="block-title">Title *</Label>
							<Input
								id="block-title"
								type="text"
								placeholder="Block title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="block-body">Body (Markdown)</Label>
							<Textarea
								id="block-body"
								placeholder="# Hello"
								value={body}
								onChange={(e) => setBody(e.target.value)}
							/>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button
							type="button"
							disabled={!title.trim() || creating}
							onClick={() => handleCreate()}
						>
							Create
						</Button>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}

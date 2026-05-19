import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { getSession } from "#/server/auth";
import { createPage, listPages } from "#/server/notes";
import { listMembers } from "#/server/orgs";

export const Route = createFileRoute("/org/$orgId/team/$teamId/pages/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
	},
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.prefetchQuery({
				queryKey: ["pages", params.teamId],
				queryFn: () =>
					listPages({ data: { orgId: params.orgId, teamId: params.teamId } }),
			}),
			context.queryClient.prefetchQuery({
				queryKey: ["org-members", params.orgId],
				queryFn: () => listMembers({ data: { orgId: params.orgId } }),
			}),
		]);
	},
	component: PagesPage,
});

function PagesPage() {
	const { orgId, teamId } = Route.useParams();
	const qc = useQueryClient();

	const { data: pages } = useQuery({
		queryKey: ["pages", teamId],
		queryFn: () => listPages({ data: { orgId, teamId } }),
	});

	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const [filter, setFilter] = useState("");
	const [newTitle, setNewTitle] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [modalOpen, setModalOpen] = useState(false);

	const { mutate: handleCreate, isPending: creating } = useMutation({
		mutationFn: () =>
			createPage({ data: { orgId, teamId, title: newTitle.trim() } }),
		onSuccess: () => {
			setNewTitle("");
			setError(null);
			setModalOpen(false);
			qc.invalidateQueries({ queryKey: ["pages", teamId] });
			qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
		},
		onError: (e: Error) => setError(e.message),
	});

	const filtered = (pages ?? []).filter((p) => {
		if (!filter.trim()) return true;
		const f = filter.toLowerCase();
		return p.titles.some((t) => t.toLowerCase().includes(f));
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
				<span className="font-medium text-foreground">Pages</span>
			</div>

			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-bold">Pages</h1>
				<Button type="button" size="sm" onClick={() => setModalOpen(true)}>
					<PlusIcon />
					New Page
				</Button>
			</div>

			<div className="mb-4">
				<Input
					type="text"
					placeholder="タイトルで絞り込み"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
				/>
			</div>

			<ul className="mb-8 space-y-2">
				{filtered.map((p) => (
					<li key={p.id}>
						<Link
							to="/org/$orgId/team/$teamId/pages/$pageId"
							params={{ orgId, teamId, pageId: p.id }}
							className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted no-underline text-foreground"
						>
							<div className="font-medium">{p.titles[0] ?? "(no title)"}</div>
							{p.titles.length > 1 && (
								<div className="text-xs text-muted-foreground mt-0.5">
									aliases: {p.titles.slice(1).join(", ")}
								</div>
							)}
						</Link>
					</li>
				))}
				{filtered.length === 0 && (
					<li className="text-muted-foreground text-sm">No pages.</li>
				)}
			</ul>

			<Dialog open={modalOpen} onOpenChange={setModalOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create Page</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="page-title">Title *</Label>
							<Input
								id="page-title"
								type="text"
								placeholder="Page title"
								value={newTitle}
								onChange={(e) => setNewTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && newTitle.trim()) handleCreate();
								}}
							/>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button
							type="button"
							disabled={!newTitle.trim() || creating}
							onClick={() => handleCreate()}
						>
							Create
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</main>
	);
}

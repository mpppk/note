import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { InlineBlockEditor } from "#/components/block-editor";
import { TitleManager } from "#/components/title-manager";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { getSession } from "#/server/auth";
import {
	addTitle,
	deleteBlock,
	getBlock,
	listTeamTitles,
	removeTitle,
	searchBacklinks,
	updateBlockBody,
} from "#/server/notes";
import { listMembers } from "#/server/orgs";

export const Route = createFileRoute(
	"/org/$orgId/team/$teamId/blocks/$blockId",
)({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
	},
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.prefetchQuery({
				queryKey: ["block", params.blockId],
				queryFn: () =>
					getBlock({
						data: { orgId: params.orgId, blockId: params.blockId },
					}),
			}),
			context.queryClient.prefetchQuery({
				queryKey: ["team-titles", params.teamId],
				queryFn: () =>
					listTeamTitles({
						data: { orgId: params.orgId, teamId: params.teamId },
					}),
			}),
			context.queryClient.prefetchQuery({
				queryKey: ["org-members", params.orgId],
				queryFn: () => listMembers({ data: { orgId: params.orgId } }),
			}),
		]);
		const block = context.queryClient.getQueryData<{ titles: string[] }>(["block", params.blockId]);
		return { blockTitle: block?.titles?.[0] ?? null };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.blockTitle
					? `${loaderData.blockTitle} | niboshi-note`
					: "niboshi-note",
			},
		],
	}),
	component: BlockDetailPage,
});

function BlockDetailPage() {
	const { orgId, teamId, blockId } = Route.useParams();
	const qc = useQueryClient();
	const navigate = useNavigate();

	const { data: block } = useQuery({
		queryKey: ["block", blockId],
		queryFn: () => getBlock({ data: { orgId, blockId } }),
	});

	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const { data: teamTitles } = useQuery({
		queryKey: ["team-titles", teamId],
		queryFn: () => listTeamTitles({ data: { orgId, teamId } }),
	});

	const { data: backlinks } = useQuery({
		queryKey: ["backlinks", blockId, block?.titles],
		queryFn: () =>
			searchBacklinks({
				data: {
					orgId,
					teamId,
					titles: block?.titles ?? [],
					excludeBlockId: blockId,
				},
			}),
		enabled: !!block && block.titles.length > 0,
	});

	const updateBody = useMutation({
		mutationFn: async (body: string) => {
			await updateBlockBody({ data: { orgId, blockId, body } });
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["block", blockId] });
			qc.invalidateQueries({ queryKey: ["blocks", teamId] });
			qc.invalidateQueries({ queryKey: ["backlinks"] });
		},
	});

	async function handleAddTitle(title: string) {
		await addTitle({
			data: { orgId, teamId, kind: "block", refId: blockId, title },
		});
		qc.invalidateQueries({ queryKey: ["block", blockId] });
		qc.invalidateQueries({ queryKey: ["blocks", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	async function handleRemoveTitle(title: string) {
		await removeTitle({
			data: { orgId, teamId, kind: "block", refId: blockId, title },
		});
		qc.invalidateQueries({ queryKey: ["block", blockId] });
		qc.invalidateQueries({ queryKey: ["blocks", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	const handleDelete = useMutation({
		mutationFn: () => deleteBlock({ data: { orgId, blockId } }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["blocks", teamId] });
			qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
			navigate({
				to: "/org/$orgId/team/$teamId/blocks",
				params: { orgId, teamId },
			});
		},
	});

	if (!block) return null;

	return (
		<main className="mx-auto max-w-3xl px-4 py-10">
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
				<Link
					to="/org/$orgId/team/$teamId/blocks"
					params={{ orgId, teamId }}
					className="hover:text-foreground transition-colors"
				>
					Blocks
				</Link>
				<span>/</span>
				<span className="font-medium text-foreground truncate">
					{block.titles[0] ?? "(no title)"}
				</span>
			</div>

			<div className="mb-4 flex items-start justify-between gap-4">
				<h1 className="text-2xl font-bold">
					{block.titles[0] ?? "(no title)"}
				</h1>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive hover:text-destructive hover:bg-destructive/10"
					onClick={() => {
						if (
							confirm(
								"Delete this block? Its links from pages will also be removed.",
							)
						) {
							handleDelete.mutate();
						}
					}}
				>
					Delete Block
				</Button>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-base">Titles</CardTitle>
				</CardHeader>
				<CardContent>
					<TitleManager
						titles={block.titles}
						onAdd={handleAddTitle}
						onRemove={handleRemoveTitle}
					/>
				</CardContent>
			</Card>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-base">Body</CardTitle>
				</CardHeader>
				<CardContent>
					<InlineBlockEditor
						body={block.body}
						onSave={(body) => updateBody.mutateAsync(body)}
						titles={teamTitles ?? []}
						orgId={orgId}
						teamId={teamId}
						excludeRefIds={[blockId]}
						saving={updateBody.isPending}
					/>
				</CardContent>
			</Card>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-base">含むPage</CardTitle>
				</CardHeader>
				<CardContent>
					{block.containingPages.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							どのページからも参照されていません。
						</p>
					) : (
						<ul className="space-y-1">
							{block.containingPages.map((p) => (
								<li key={p.pageId}>
									<Link
										to="/org/$orgId/team/$teamId/pages/$pageId"
										params={{ orgId, teamId, pageId: p.pageId }}
										className="text-primary underline"
									>
										{p.titles[0] ?? "(no title)"}
									</Link>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Backlinks</CardTitle>
				</CardHeader>
				<CardContent>
					{!backlinks || backlinks.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							このBlockのタイトルを参照するBlockはありません。
						</p>
					) : (
						<ul className="space-y-1">
							{backlinks.map((b) => (
								<li key={b.id}>
									<Link
										to="/org/$orgId/team/$teamId/blocks/$blockId"
										params={{ orgId, teamId, blockId: b.id }}
										className="text-primary underline"
									>
										{b.titles[0] ?? "(no title)"}
									</Link>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

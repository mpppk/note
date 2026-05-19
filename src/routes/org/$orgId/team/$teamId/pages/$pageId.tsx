import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { ExternalLink, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InlineBlockEditor } from "#/components/block-editor";
import { PageEditor } from "#/components/page-editor";
import { splitBodyAtAllH1H2 } from "#/components/page-editor/section-state";
import { TitleManager } from "#/components/title-manager";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { getSession } from "#/server/auth";
import {
	addEmbedSection,
	addTextSection,
	addTextSectionAfter,
	addTitle,
	deletePage,
	getPageWithEmbeds,
	listPages,
	listTeamTitles,
	removeSection,
	removeTitle,
	reorderSections,
	updateSectionBody,
} from "#/server/notes";
import { listMembers } from "#/server/orgs";

export const Route = createFileRoute("/org/$orgId/team/$teamId/pages/$pageId")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
	},
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.prefetchQuery({
				queryKey: ["page-embeds", params.pageId],
				queryFn: () =>
					getPageWithEmbeds({
						data: { orgId: params.orgId, pageId: params.pageId },
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
		const page = context.queryClient.getQueryData<{ titles: string[] }>([
			"page-embeds",
			params.pageId,
		]);
		return { pageTitle: page?.titles?.[0] ?? null };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.pageTitle
					? `${loaderData.pageTitle} | niboshi-note`
					: "niboshi-note",
			},
		],
	}),
	component: PageDetailPage,
});

type SectionData = {
	id: string;
	type: "text" | "embed";
	body: string;
	order: number;
	embedPageId: string | null;
	embedPage?: {
		id: string;
		titles: string[];
		sections: SectionData[];
	} | null;
};

function PageDetailPage() {
	const { orgId, teamId, pageId } = Route.useParams();
	const qc = useQueryClient();
	const navigate = useNavigate();

	// Dark mode detection (guard against SSR where document is not available)
	const [dark, setDark] = useState(
		() =>
			typeof document !== "undefined" &&
			document.documentElement.classList.contains("dark"),
	);
	useEffect(() => {
		const observer = new MutationObserver(() => {
			setDark(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	const { data: page } = useQuery({
		queryKey: ["page-embeds", pageId],
		queryFn: () => getPageWithEmbeds({ data: { orgId, pageId } }),
		// Poll every 30s for embed content updates (Phase 4 polling)
		refetchInterval: 30_000,
	});

	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const { data: teamTitles } = useQuery({
		queryKey: ["team-titles", teamId],
		queryFn: () => listTeamTitles({ data: { orgId, teamId } }),
	});

	const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
	const [titleDialogOpen, setTitleDialogOpen] = useState(false);

	useEffect(() => {
		if (page) setOrderedIds(page.sections.map((s) => s.id));
	}, [page]);

	const sectionsById = useMemo(() => {
		const m = new Map<string, SectionData>();
		if (page) for (const s of page.sections) m.set(s.id, s);
		return m;
	}, [page]);

	const reorder = useMutation({
		mutationFn: (sectionIds: string[]) =>
			reorderSections({ data: { orgId, pageId, sectionIds } }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["page-embeds", pageId] }),
	});

	const updateBody = useMutation({
		mutationFn: async (vars: { sectionId: string; body: string }) => {
			await updateSectionBody({
				data: { orgId, sectionId: vars.sectionId, body: vars.body },
			});
		},
		onMutate: async (vars) => {
			await qc.cancelQueries({ queryKey: ["page-embeds", pageId] });
			const previousData = qc.getQueryData<{
				id: string;
				titles: string[];
				sections: SectionData[];
			}>(["page-embeds", pageId]);
			qc.setQueryData<{
				id: string;
				titles: string[];
				sections: SectionData[];
			}>(["page-embeds", pageId], (old) => {
				if (!old) return old;
				return {
					...old,
					sections: old.sections.map((s) =>
						s.id === vars.sectionId ? { ...s, body: vars.body } : s,
					),
				};
			});
			return { previousData };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previousData) {
				qc.setQueryData(["page-embeds", pageId], ctx.previousData);
			}
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["page-embeds", pageId] });
		},
	});

	const removeSec = useMutation({
		mutationFn: (sectionId: string) =>
			removeSection({ data: { orgId, pageId, sectionId } }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["page-embeds", pageId] }),
	});

	const addSectionAfter = useMutation({
		mutationFn: (vars: { afterSectionId: string; body: string }) =>
			addTextSectionAfter({
				data: {
					orgId,
					pageId,
					afterSectionId: vars.afterSectionId,
					body: vars.body,
				},
			}),
		// No query invalidation — the editor tracks the new section locally.
		// The 30s poll provides eventual DB consistency.
	});

	const reconciledSectionIds = useRef(new Set<string>());

	// biome-ignore lint/correctness/useExhaustiveDependencies: mutations and qc are stable references; reconciledSectionIds is a ref
	useEffect(() => {
		const textSections = (page?.sections ?? []).filter(
			(s) => s.type === "text",
		);
		const toSplit = textSections.filter(
			(s) =>
				!reconciledSectionIds.current.has(s.id) &&
				splitBodyAtAllH1H2(s.body).length > 1,
		);
		if (toSplit.length === 0) return;
		for (const s of toSplit) reconciledSectionIds.current.add(s.id);

		(async () => {
			for (const section of toSplit) {
				const bodies = splitBodyAtAllH1H2(section.body);
				await updateBody.mutateAsync({
					sectionId: section.id,
					body: bodies[0],
				});
				let afterId = section.id;
				for (const body of bodies.slice(1)) {
					const result = await addSectionAfter.mutateAsync({
						afterSectionId: afterId,
						body,
					});
					afterId = result.id;
				}
			}
			qc.invalidateQueries({ queryKey: ["page-embeds", pageId] });
		})().catch(console.error);
	}, [page]);

	async function handleAddTitle(title: string) {
		await addTitle({
			data: { orgId, teamId, refId: pageId, title },
		});
		qc.invalidateQueries({ queryKey: ["page-embeds", pageId] });
		qc.invalidateQueries({ queryKey: ["pages", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	async function handleRemoveTitle(title: string) {
		await removeTitle({
			data: { orgId, teamId, refId: pageId, title },
		});
		qc.invalidateQueries({ queryKey: ["page-embeds", pageId] });
		qc.invalidateQueries({ queryKey: ["pages", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	const handleDeletePage = useMutation({
		mutationFn: () => deletePage({ data: { orgId, pageId } }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["pages", teamId] });
			qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
			navigate({
				to: "/org/$orgId/team/$teamId",
				params: { orgId, teamId },
			});
		},
	});

	if (!page || !orderedIds) return null;

	const orderedSections = orderedIds
		.map((id) => sectionsById.get(id))
		.filter(Boolean) as SectionData[];

	const textSections = orderedSections.filter((s) => s.type === "text");
	const embedSections = orderedSections.filter((s) => s.type === "embed");

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
				<span className="font-medium text-foreground truncate">
					{page.titles[0] ?? "(no title)"}
				</span>
			</div>

			<div className="mb-4 flex items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">{page.titles[0] ?? "(no title)"}</h1>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-muted-foreground"
							aria-label="Page options"
						>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => setTitleDialogOpen(true)}>
							タイトルを編集
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="text-destructive focus:text-destructive focus:bg-destructive/10"
							onSelect={() => {
								if (
									confirm(
										"Delete this page? Embed sections referencing this page will be cleared.",
									)
								) {
									handleDeletePage.mutate();
								}
							}}
						>
							ページを削除
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>タイトルを編集</DialogTitle>
					</DialogHeader>
					<TitleManager
						titles={page.titles}
						onAdd={handleAddTitle}
						onRemove={handleRemoveTitle}
					/>
				</DialogContent>
			</Dialog>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-base">Sections</CardTitle>
				</CardHeader>
				<CardContent>
					{orderedIds.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							まだセクションがありません。下のフォームから追加してください。
						</p>
					) : (
						<>
							{/* Text sections: unified Live Preview editor */}
							{textSections.length > 0 && (
								<PageEditor
									sections={textSections.map((s) => ({
										id: s.id,
										body: s.body,
									}))}
									onSave={(sectionId, body) =>
										updateBody.mutateAsync({ sectionId, body })
									}
									onReorder={(newTextIds) => {
										const newIds = [
											...newTextIds,
											...embedSections.map((s) => s.id),
										];
										setOrderedIds(newIds);
										reorder.mutate(newIds);
									}}
									onAddSectionAfter={async (afterSectionId, body) => {
										const result = await addSectionAfter.mutateAsync({
											afterSectionId,
											body,
										});
										return result.id;
									}}
									onDeleteSection={async (sectionId) => {
										await removeSec.mutateAsync(sectionId);
									}}
									dark={dark}
									titles={teamTitles ?? []}
									orgId={orgId}
									teamId={teamId}
									excludeRefIds={[pageId]}
								/>
							)}

							{/* Embed sections: shown as expandable inline blocks */}
							{embedSections.map((s) => (
								<div key={s.id} className="mt-4">
									<div className="flex items-center justify-between gap-2 mb-1 text-xs text-muted-foreground">
										<span className="font-medium">
											📎 {s.embedPage?.titles[0] ?? s.embedPageId ?? "(embed)"}
										</span>
										<div className="flex items-center gap-1">
											{s.embedPageId && (
												<Link
													to="/org/$orgId/team/$teamId/pages/$pageId"
													params={{
														orgId,
														teamId,
														pageId: s.embedPageId,
													}}
													className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
												>
													<ExternalLink className="h-3 w-3" />
													開く
												</Link>
											)}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-6 text-xs text-muted-foreground hover:text-destructive px-1"
												onClick={() => removeSec.mutate(s.id)}
											>
												削除
											</Button>
										</div>
									</div>
									{s.embedPage ? (
										<EmbedPageView
											embedPage={s.embedPage}
											orgId={orgId}
											teamId={teamId}
											titles={teamTitles ?? []}
										/>
									) : (
										<p className="text-sm text-muted-foreground italic">
											(embedded page was deleted)
										</p>
									)}
								</div>
							))}
						</>
					)}
				</CardContent>
			</Card>

			<AddSectionForm orgId={orgId} teamId={teamId} pageId={pageId} />
		</main>
	);
}

function EmbedPageView({
	embedPage,
	orgId,
	teamId,
	titles,
}: {
	embedPage: NonNullable<SectionData["embedPage"]>;
	orgId: string;
	teamId: string;
	titles: { title: string; refId: string }[];
}) {
	const qc = useQueryClient();
	const updateBody = useMutation({
		mutationFn: async (vars: { sectionId: string; body: string }) => {
			await updateSectionBody({
				data: { orgId, sectionId: vars.sectionId, body: vars.body },
			});
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["page-embeds"] });
		},
	});

	return (
		<div className="border-l-2 border-primary/20 pl-3 ml-1">
			{embedPage.sections.map((s) => (
				<div key={s.id} className="mb-1">
					{s.type === "text" ? (
						<InlineBlockEditor
							body={s.body}
							onSave={(body) =>
								updateBody.mutateAsync({ sectionId: s.id, body })
							}
							titles={titles}
							orgId={orgId}
							teamId={teamId}
							excludeRefIds={[embedPage.id]}
						/>
					) : s.embedPage ? (
						<EmbedPageView
							embedPage={s.embedPage}
							orgId={orgId}
							teamId={teamId}
							titles={titles}
						/>
					) : (
						<p className="text-sm text-muted-foreground italic">
							(embedded page was deleted)
						</p>
					)}
				</div>
			))}
			{embedPage.sections.length === 0 && (
				<p className="text-sm text-muted-foreground italic">(empty page)</p>
			)}
		</div>
	);
}

function AddSectionForm({
	orgId,
	teamId,
	pageId,
}: {
	orgId: string;
	teamId: string;
	pageId: string;
}) {
	const qc = useQueryClient();
	const [mode, setMode] = useState<"text" | "embed">("text");
	const [body, setBody] = useState("");
	const [filter, setFilter] = useState("");
	const [error, setError] = useState<string | null>(null);

	const { data: allPages } = useQuery({
		queryKey: ["pages", teamId],
		queryFn: () => listPages({ data: { orgId, teamId } }),
		enabled: mode === "embed",
	});

	const addText = useMutation({
		mutationFn: () => addTextSection({ data: { orgId, pageId, body } }),
		onSuccess: () => {
			setBody("");
			setError(null);
			qc.invalidateQueries({ queryKey: ["page-embeds", pageId] });
		},
		onError: (e: Error) => setError(e.message),
	});

	const addEmbed = useMutation({
		mutationFn: (embedPageId: string) =>
			addEmbedSection({ data: { orgId, pageId, embedPageId } }),
		onSuccess: () => {
			setError(null);
			qc.invalidateQueries({ queryKey: ["page-embeds", pageId] });
		},
		onError: (e: Error) => setError(e.message),
	});

	const filtered = (allPages ?? []).filter((p) => {
		if (p.id === pageId) return false; // Don't allow self-embed
		if (!filter.trim()) return true;
		const f = filter.toLowerCase();
		return p.titles.some((t) => t.toLowerCase().includes(f));
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<Plus className="h-4 w-4" />
					Add Section
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex gap-2 text-sm">
					<button
						type="button"
						className={`px-3 py-1 rounded-md border ${
							mode === "text"
								? "border-primary bg-primary text-primary-foreground"
								: "border-border"
						}`}
						onClick={() => setMode("text")}
					>
						Text
					</button>
					<button
						type="button"
						className={`px-3 py-1 rounded-md border ${
							mode === "embed"
								? "border-primary bg-primary text-primary-foreground"
								: "border-border"
						}`}
						onClick={() => setMode("embed")}
					>
						Embed Page
					</button>
				</div>

				{mode === "text" ? (
					<>
						<textarea
							className="min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm font-mono bg-background"
							placeholder="Markdown text..."
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button
							type="button"
							disabled={!body.trim() || addText.isPending}
							onClick={() => addText.mutate()}
						>
							Add Text Section
						</Button>
					</>
				) : (
					<>
						<Input
							type="text"
							placeholder="ページをタイトルで検索"
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
						/>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<ul className="space-y-1 max-h-80 overflow-auto">
							{filtered.map((p) => (
								<li
									key={p.id}
									className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<div className="font-medium text-sm truncate">
											{p.titles[0] ?? "(no title)"}
										</div>
										{p.titles.length > 1 && (
											<div className="text-xs text-muted-foreground truncate">
												aliases: {p.titles.slice(1).join(", ")}
											</div>
										)}
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => addEmbed.mutate(p.id)}
										disabled={addEmbed.isPending}
									>
										Embed
									</Button>
								</li>
							))}
							{filtered.length === 0 && (
								<li className="text-sm text-muted-foreground">
									該当するページがありません。
								</li>
							)}
						</ul>
					</>
				)}
			</CardContent>
		</Card>
	);
}

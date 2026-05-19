import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { ExternalLink, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { InlineBlockEditor } from "#/components/block-editor";
import { PageEditor } from "#/components/page-editor";
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

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const reorder = useMutation({
		mutationFn: (sectionIds: string[]) =>
			reorderSections({ data: { orgId, pageId, sectionIds } }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["page-embeds", pageId] }),
	});

	function handleDragEnd(e: DragEndEvent) {
		const { active, over } = e;
		if (!over || active.id === over.id || !orderedIds) return;
		const oldIndex = orderedIds.indexOf(String(active.id));
		const newIndex = orderedIds.indexOf(String(over.id));
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(orderedIds, oldIndex, newIndex);
		setOrderedIds(next);
		reorder.mutate(next);
	}

	const updateBody = useMutation({
		mutationFn: async (vars: { sectionId: string; body: string }) => {
			await updateSectionBody({
				data: { orgId, sectionId: vars.sectionId, body: vars.body },
			});
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

	const hasEmbeds = page.sections.some((s) => s.type === "embed");

	const orderedSections = orderedIds
		.map((id) => sectionsById.get(id))
		.filter(Boolean) as SectionData[];

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
					) : !hasEmbeds ? (
						// Single unified editor for text-only pages
						<PageEditor
							sections={orderedSections.map((s) => ({
								id: s.id,
								body: s.body,
							}))}
							onSave={(sectionId, body) =>
								updateBody.mutateAsync({ sectionId, body })
							}
							dark={dark}
						/>
					) : (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}
						>
							<SortableContext
								items={orderedIds}
								strategy={verticalListSortingStrategy}
							>
								<ul className="space-y-0">
									{orderedIds.map((sid) => {
										const s = sectionsById.get(sid);
										if (!s) return null;
										return (
											<SortableSection
												key={s.id}
												section={s}
												orgId={orgId}
												teamId={teamId}
												titles={teamTitles ?? []}
												onSave={(body) =>
													updateBody.mutateAsync({
														sectionId: s.id,
														body,
													})
												}
												onRemove={() => removeSec.mutate(s.id)}
											/>
										);
									})}
								</ul>
							</SortableContext>
						</DndContext>
					)}
				</CardContent>
			</Card>

			<AddSectionForm orgId={orgId} teamId={teamId} pageId={pageId} />
		</main>
	);
}

type SortableSectionProps = {
	section: SectionData;
	orgId: string;
	teamId: string;
	titles: { title: string; refId: string }[];
	onSave: (body: string) => Promise<void>;
	onRemove: () => void;
};

function SortableSection({
	section,
	orgId,
	teamId,
	titles,
	onSave,
	onRemove,
}: SortableSectionProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: section.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<li
			ref={setNodeRef}
			style={style}
			className="group relative rounded-md transition-colors hover:bg-muted/50 focus-within:bg-muted/30"
		>
			<div className="flex items-center justify-between gap-2 px-3 pt-2 pb-0.5">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<button
						type="button"
						className="cursor-grab text-muted-foreground hover:text-foreground select-none touch-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
						aria-label="Drag to reorder"
						{...attributes}
						{...listeners}
					>
						⋮⋮
					</button>
					{section.type === "embed" && section.embedPage && (
						<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
							embed: {section.embedPage.titles[0] ?? "(no title)"}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
					{section.type === "embed" && section.embedPageId && (
						<Link
							to="/org/$orgId/team/$teamId/pages/$pageId"
							params={{ orgId, teamId, pageId: section.embedPageId }}
							className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
							aria-label="Go to embedded page"
						>
							<ExternalLink className="h-3.5 w-3.5" />
						</Link>
					)}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 text-xs text-muted-foreground hover:text-destructive"
						onClick={onRemove}
					>
						Remove
					</Button>
				</div>
			</div>
			<div className="px-3 pb-2 pt-0.5">
				{section.type === "text" ? (
					<InlineBlockEditor
						body={section.body}
						onSave={onSave}
						titles={titles}
						orgId={orgId}
						teamId={teamId}
						excludeRefIds={[]}
					/>
				) : section.embedPage ? (
					<EmbedPageView
						embedPage={section.embedPage}
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
		</li>
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

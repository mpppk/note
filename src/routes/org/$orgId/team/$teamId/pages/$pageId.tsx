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
import { InfoIcon, MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { InlineBlockEditor } from "#/components/block-editor";
import { TitleManager } from "#/components/title-manager";
import { Button } from "#/components/ui/button";
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
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { getSession } from "#/server/auth";
import {
	addBlockToPage,
	addTitle,
	createAndAddBlockToPage,
	deleteBlock,
	deletePage,
	getPage,
	listBlocks,
	listTeamTitles,
	removeTitle,
	reorderPageBlocks,
	unlinkBlockFromPage,
	updateBlockBody,
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
				queryKey: ["page", params.pageId],
				queryFn: () =>
					getPage({ data: { orgId: params.orgId, pageId: params.pageId } }),
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
			"page",
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

function PageDetailPage() {
	const { orgId, teamId, pageId } = Route.useParams();
	const qc = useQueryClient();
	const navigate = useNavigate();

	const { data: page } = useQuery({
		queryKey: ["page", pageId],
		queryFn: () => getPage({ data: { orgId, pageId } }),
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
	const [addBlockDialogOpen, setAddBlockDialogOpen] = useState(false);

	useEffect(() => {
		if (page) setOrderedIds(page.blocks.map((b) => b.id));
	}, [page]);

	const blocksById = useMemo(() => {
		const m = new Map<string, NonNullable<typeof page>["blocks"][number]>();
		if (page) for (const b of page.blocks) m.set(b.id, b);
		return m;
	}, [page]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const reorder = useMutation({
		mutationFn: (blockIds: string[]) =>
			reorderPageBlocks({ data: { orgId, pageId, blockIds } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["page", pageId] }),
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
		mutationFn: async (vars: { blockId: string; body: string }) => {
			await updateBlockBody({
				data: { orgId, blockId: vars.blockId, body: vars.body },
			});
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["page", pageId] });
			qc.invalidateQueries({ queryKey: ["blocks", teamId] });
		},
	});

	const unlink = useMutation({
		mutationFn: (blockId: string) =>
			unlinkBlockFromPage({ data: { orgId, pageId, blockId } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["page", pageId] }),
	});

	const deleteB = useMutation({
		mutationFn: (blockId: string) => deleteBlock({ data: { orgId, blockId } }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["page", pageId] });
			qc.invalidateQueries({ queryKey: ["blocks", teamId] });
			qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
		},
	});

	async function handleAddTitle(title: string) {
		await addTitle({
			data: { orgId, teamId, kind: "page", refId: pageId, title },
		});
		qc.invalidateQueries({ queryKey: ["page", pageId] });
		qc.invalidateQueries({ queryKey: ["pages", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	async function handleRemoveTitle(title: string) {
		await removeTitle({
			data: { orgId, teamId, kind: "page", refId: pageId, title },
		});
		qc.invalidateQueries({ queryKey: ["page", pageId] });
		qc.invalidateQueries({ queryKey: ["pages", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	async function handleAddBlockTitle(blockId: string, title: string) {
		await addTitle({
			data: { orgId, teamId, kind: "block", refId: blockId, title },
		});
		qc.invalidateQueries({ queryKey: ["page", pageId] });
		qc.invalidateQueries({ queryKey: ["blocks", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	async function handleRemoveBlockTitle(blockId: string, title: string) {
		await removeTitle({
			data: { orgId, teamId, kind: "block", refId: blockId, title },
		});
		qc.invalidateQueries({ queryKey: ["page", pageId] });
		qc.invalidateQueries({ queryKey: ["blocks", teamId] });
		qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
	}

	const handleDeletePage = useMutation({
		mutationFn: () => deletePage({ data: { orgId, pageId } }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["pages", teamId] });
			qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
			navigate({
				to: "/org/$orgId/team/$teamId/pages",
				params: { orgId, teamId },
			});
		},
	});

	if (!page || !orderedIds) return null;

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
					to="/org/$orgId/team/$teamId/pages"
					params={{ orgId, teamId }}
					className="hover:text-foreground transition-colors"
				>
					Pages
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
						<DropdownMenuItem onSelect={() => setAddBlockDialogOpen(true)}>
							セクション追加
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="text-destructive focus:text-destructive focus:bg-destructive/10"
							onSelect={() => {
								if (
									confirm(
										"Delete this page? Its blocks will remain but page links will be removed.",
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

			<AddBlockDialog
				open={addBlockDialogOpen}
				onOpenChange={setAddBlockDialogOpen}
				orgId={orgId}
				teamId={teamId}
				pageId={pageId}
			/>

			{orderedIds.length > 0 && (
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
							{orderedIds.map((bid) => {
								const b = blocksById.get(bid);
								if (!b) return null;
								return (
									<SortableBlock
										key={b.id}
										blockId={b.id}
										blockTitles={b.titles}
										body={b.body}
										orgId={orgId}
										teamId={teamId}
										titles={teamTitles ?? []}
										onSave={(body) =>
											updateBody.mutateAsync({ blockId: b.id, body })
										}
										onUnlink={() => unlink.mutate(b.id)}
										onDelete={() => deleteB.mutate(b.id)}
										onAddTitle={(title) => handleAddBlockTitle(b.id, title)}
										onRemoveTitle={(title) =>
											handleRemoveBlockTitle(b.id, title)
										}
									/>
								);
							})}
						</ul>
					</SortableContext>
				</DndContext>
			)}
		</main>
	);
}

type SortableBlockProps = {
	blockId: string;
	blockTitles: string[];
	body: string;
	orgId: string;
	teamId: string;
	titles: { title: string; kind: "block" | "page"; refId: string }[];
	onSave: (body: string) => Promise<void>;
	onUnlink: () => void;
	onDelete: () => void;
	onAddTitle: (title: string) => Promise<void>;
	onRemoveTitle: (title: string) => Promise<void>;
};

function SortableBlock({
	blockId,
	blockTitles,
	body,
	orgId,
	teamId,
	titles,
	onSave,
	onUnlink,
	onDelete,
	onAddTitle,
	onRemoveTitle,
}: SortableBlockProps) {
	const [detailOpen, setDetailOpen] = useState(false);

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: blockId });

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
				</div>
				<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-foreground"
						aria-label="Block detail"
						onClick={() => setDetailOpen(true)}
					>
						<InfoIcon className="h-4 w-4" />
					</Button>
				</div>
			</div>
			<div className="px-3 pb-2 pt-0.5">
				<InlineBlockEditor
					body={body}
					onSave={onSave}
					titles={titles}
					orgId={orgId}
					teamId={teamId}
					excludeRefIds={[blockId]}
				/>
			</div>

			<Dialog open={detailOpen} onOpenChange={setDetailOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Block Detail</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<TitleManager
							titles={blockTitles}
							onAdd={onAddTitle}
							onRemove={onRemoveTitle}
						/>
						<div className="flex gap-2 pt-2 border-t">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => {
									onUnlink();
									setDetailOpen(false);
								}}
							>
								Unlink
							</Button>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={() => {
									if (
										confirm(
											"Delete this block entirely? It will be removed from all pages.",
										)
									) {
										onDelete();
										setDetailOpen(false);
									}
								}}
							>
								Delete
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</li>
	);
}

function AddBlockDialog({
	open,
	onOpenChange,
	orgId,
	teamId,
	pageId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: string;
	teamId: string;
	pageId: string;
}) {
	const qc = useQueryClient();
	const [mode, setMode] = useState<"new" | "existing">("new");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [filter, setFilter] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			setTitle("");
			setBody("");
			setFilter("");
			setMode("new");
			setError(null);
		}
	}, [open]);

	const { data: blocks } = useQuery({
		queryKey: ["blocks", teamId],
		queryFn: () => listBlocks({ data: { orgId, teamId } }),
		enabled: mode === "existing",
	});

	const createAndAdd = useMutation({
		mutationFn: () =>
			createAndAddBlockToPage({
				data: { orgId, teamId, pageId, title: title.trim(), body },
			}),
		onSuccess: () => {
			setTitle("");
			setBody("");
			setFilter("");
			setMode("new");
			setError(null);
			onOpenChange(false);
			qc.invalidateQueries({ queryKey: ["page", pageId] });
			qc.invalidateQueries({ queryKey: ["blocks", teamId] });
			qc.invalidateQueries({ queryKey: ["team-titles", teamId] });
		},
		onError: (e: Error) => setError(e.message),
	});

	const addExisting = useMutation({
		mutationFn: (blockId: string) =>
			addBlockToPage({ data: { orgId, teamId, pageId, blockId } }),
		onSuccess: () => {
			setFilter("");
			setMode("new");
			setError(null);
			onOpenChange(false);
			qc.invalidateQueries({ queryKey: ["page", pageId] });
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>セクション追加</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex gap-2 text-sm">
						<button
							type="button"
							className={`px-3 py-1 rounded-md border ${
								mode === "new"
									? "border-primary bg-primary text-primary-foreground"
									: "border-border"
							}`}
							onClick={() => setMode("new")}
						>
							New
						</button>
						<button
							type="button"
							className={`px-3 py-1 rounded-md border ${
								mode === "existing"
									? "border-primary bg-primary text-primary-foreground"
									: "border-border"
							}`}
							onClick={() => setMode("existing")}
						>
							Existing
						</button>
					</div>

					{mode === "new" ? (
						<>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="new-block-title">Title *</Label>
								<Input
									id="new-block-title"
									type="text"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="new-block-body">Body (Markdown)</Label>
								<Textarea
									id="new-block-body"
									value={body}
									onChange={(e) => setBody(e.target.value)}
								/>
							</div>
							{error && <p className="text-sm text-destructive">{error}</p>}
							<Button
								type="button"
								disabled={!title.trim() || createAndAdd.isPending}
								onClick={() => createAndAdd.mutate()}
							>
								Create & Add
							</Button>
						</>
					) : (
						<>
							<Input
								type="text"
								placeholder="既存Blockを検索"
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
							/>
							{error && <p className="text-sm text-destructive">{error}</p>}
							<ul className="space-y-1 max-h-80 overflow-auto">
								{filtered.map((b) => (
									<li
										key={b.id}
										className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
									>
										<div className="min-w-0 flex-1">
											<div className="font-medium text-sm truncate">
												{b.titles[0] ?? "(no title)"}
											</div>
											{b.titles.length > 1 && (
												<div className="text-xs text-muted-foreground truncate">
													aliases: {b.titles.slice(1).join(", ")}
												</div>
											)}
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => addExisting.mutate(b.id)}
											disabled={addExisting.isPending}
										>
											Add
										</Button>
									</li>
								))}
								{filtered.length === 0 && (
									<li className="text-sm text-muted-foreground">
										該当するBlockがありません。
									</li>
								)}
							</ul>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

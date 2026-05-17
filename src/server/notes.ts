import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import { blocks, pageBlocks, pages, titles } from "#/db/schema";
import { auth } from "#/lib/auth";
import { authMiddleware } from "#/server/middleware";

async function requireOrgMember(orgId: string, userId: string) {
	const request = getRequest();
	const org = await auth.api.getFullOrganization({
		headers: request.headers,
		query: { organizationId: orgId },
	});
	if (!org) throw new Error("Organization not found");
	const member = org.members.find((m) => m.userId === userId);
	if (!member) throw new Error("Forbidden: not a member of this organization");
	return member;
}

function normalize(title: string): string {
	return title.trim().toLowerCase();
}

async function findTitleConflict(teamId: string, title: string) {
	const lower = normalize(title);
	const rows = await db
		.select()
		.from(titles)
		.where(and(eq(titles.teamId, teamId), eq(titles.titleLower, lower)))
		.limit(1);
	return rows[0] ?? null;
}

export const listBlocks = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), teamId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const blockRows = await db
			.select()
			.from(blocks)
			.where(eq(blocks.teamId, data.teamId))
			.orderBy(desc(blocks.updatedAt));
		if (blockRows.length === 0) return [];
		const blockIds = blockRows.map((b) => b.id);
		const titleRows = await db
			.select()
			.from(titles)
			.where(and(eq(titles.kind, "block"), inArray(titles.refId, blockIds)));
		const byBlock = new Map<string, string[]>();
		for (const t of titleRows) {
			const arr = byBlock.get(t.refId) ?? [];
			arr.push(t.title);
			byBlock.set(t.refId, arr);
		}
		return blockRows.map((b) => ({
			...b,
			titles: byBlock.get(b.id) ?? [],
		}));
	});

export const listPages = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), teamId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const pageRows = await db
			.select()
			.from(pages)
			.where(eq(pages.teamId, data.teamId))
			.orderBy(desc(pages.updatedAt));
		if (pageRows.length === 0) return [];
		const pageIds = pageRows.map((p) => p.id);
		const titleRows = await db
			.select()
			.from(titles)
			.where(and(eq(titles.kind, "page"), inArray(titles.refId, pageIds)));
		const byPage = new Map<string, string[]>();
		for (const t of titleRows) {
			const arr = byPage.get(t.refId) ?? [];
			arr.push(t.title);
			byPage.set(t.refId, arr);
		}
		return pageRows.map((p) => ({
			...p,
			titles: byPage.get(p.id) ?? [],
		}));
	});

export const listTeamTitles = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), teamId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		return db
			.select({
				title: titles.title,
				kind: titles.kind,
				refId: titles.refId,
			})
			.from(titles)
			.where(eq(titles.teamId, data.teamId));
	});

export const getBlock = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), blockId: z.string() }))
	.handler(async ({ data, context }) => {
		const [block] = await db
			.select()
			.from(blocks)
			.where(eq(blocks.id, data.blockId))
			.limit(1);
		if (!block) throw new Error("Block not found");
		await requireOrgMember(data.orgId, context.user.id);
		const blockTitles = await db
			.select()
			.from(titles)
			.where(and(eq(titles.kind, "block"), eq(titles.refId, block.id)))
			.orderBy(asc(titles.createdAt));
		const containingRows = await db
			.select({
				pageId: pageBlocks.pageId,
				title: titles.title,
			})
			.from(pageBlocks)
			.leftJoin(
				titles,
				and(eq(titles.kind, "page"), eq(titles.refId, pageBlocks.pageId)),
			)
			.where(eq(pageBlocks.blockId, block.id));
		const containingMap = new Map<string, string[]>();
		for (const r of containingRows) {
			const arr = containingMap.get(r.pageId) ?? [];
			if (r.title) arr.push(r.title);
			containingMap.set(r.pageId, arr);
		}
		const containingPages = Array.from(containingMap.entries()).map(
			([pageId, ts]) => ({ pageId, titles: ts }),
		);
		return {
			...block,
			titles: blockTitles.map((t) => t.title),
			containingPages,
		};
	});

export const getPage = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), pageId: z.string() }))
	.handler(async ({ data, context }) => {
		const [page] = await db
			.select()
			.from(pages)
			.where(eq(pages.id, data.pageId))
			.limit(1);
		if (!page) throw new Error("Page not found");
		await requireOrgMember(data.orgId, context.user.id);
		const pageTitles = await db
			.select()
			.from(titles)
			.where(and(eq(titles.kind, "page"), eq(titles.refId, page.id)))
			.orderBy(asc(titles.createdAt));
		const items = await db
			.select({
				blockId: pageBlocks.blockId,
				order: pageBlocks.order,
				body: blocks.body,
				blockUpdatedAt: blocks.updatedAt,
			})
			.from(pageBlocks)
			.innerJoin(blocks, eq(blocks.id, pageBlocks.blockId))
			.where(eq(pageBlocks.pageId, page.id))
			.orderBy(asc(pageBlocks.order));
		const blockIds = items.map((i) => i.blockId);
		const blockTitleRows = blockIds.length
			? await db
					.select()
					.from(titles)
					.where(and(eq(titles.kind, "block"), inArray(titles.refId, blockIds)))
			: [];
		const titlesByBlock = new Map<string, string[]>();
		for (const t of blockTitleRows) {
			const arr = titlesByBlock.get(t.refId) ?? [];
			arr.push(t.title);
			titlesByBlock.set(t.refId, arr);
		}
		return {
			...page,
			titles: pageTitles.map((t) => t.title),
			blocks: items.map((i) => ({
				id: i.blockId,
				order: i.order,
				body: i.body,
				updatedAt: i.blockUpdatedAt,
				titles: titlesByBlock.get(i.blockId) ?? [],
			})),
		};
	});

const TitleSchema = z.string().trim().min(1).max(200);

export const createBlock = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			title: TitleSchema,
			body: z.string().default(""),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const conflict = await findTitleConflict(data.teamId, data.title);
		if (conflict) throw new Error("Title already in use in this team");
		const id = crypto.randomUUID();
		await db.insert(blocks).values({
			id,
			teamId: data.teamId,
			body: data.body,
		});
		await db.insert(titles).values({
			teamId: data.teamId,
			title: data.title.trim(),
			titleLower: normalize(data.title),
			kind: "block",
			refId: id,
		});
		return { id };
	});

export const createPage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			title: TitleSchema,
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const conflict = await findTitleConflict(data.teamId, data.title);
		if (conflict) throw new Error("Title already in use in this team");
		const id = crypto.randomUUID();
		await db.insert(pages).values({
			id,
			teamId: data.teamId,
		});
		await db.insert(titles).values({
			teamId: data.teamId,
			title: data.title.trim(),
			titleLower: normalize(data.title),
			kind: "page",
			refId: id,
		});
		return { id };
	});

export const updateBlockBody = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			blockId: z.string(),
			body: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const [block] = await db
			.select()
			.from(blocks)
			.where(eq(blocks.id, data.blockId))
			.limit(1);
		if (!block) throw new Error("Block not found");
		await db
			.update(blocks)
			.set({ body: data.body, updatedAt: new Date() })
			.where(eq(blocks.id, data.blockId));
		return { success: true };
	});

export const addTitle = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			kind: z.enum(["block", "page"]),
			refId: z.string(),
			title: TitleSchema,
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const conflict = await findTitleConflict(data.teamId, data.title);
		if (conflict) throw new Error("Title already in use in this team");
		await db.insert(titles).values({
			teamId: data.teamId,
			title: data.title.trim(),
			titleLower: normalize(data.title),
			kind: data.kind,
			refId: data.refId,
		});
		return { success: true };
	});

export const removeTitle = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			kind: z.enum(["block", "page"]),
			refId: z.string(),
			title: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const remaining = await db
			.select()
			.from(titles)
			.where(
				and(
					eq(titles.teamId, data.teamId),
					eq(titles.kind, data.kind),
					eq(titles.refId, data.refId),
				),
			);
		if (remaining.length <= 1) {
			throw new Error("Cannot remove the only remaining title");
		}
		await db
			.delete(titles)
			.where(
				and(
					eq(titles.teamId, data.teamId),
					eq(titles.kind, data.kind),
					eq(titles.refId, data.refId),
					eq(titles.titleLower, normalize(data.title)),
				),
			);
		return { success: true };
	});

export const addBlockToPage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			pageId: z.string(),
			blockId: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const existing = await db
			.select()
			.from(pageBlocks)
			.where(
				and(
					eq(pageBlocks.pageId, data.pageId),
					eq(pageBlocks.blockId, data.blockId),
				),
			)
			.limit(1);
		if (existing.length > 0) {
			throw new Error("Block already in page");
		}
		const last = await db
			.select({ order: pageBlocks.order })
			.from(pageBlocks)
			.where(eq(pageBlocks.pageId, data.pageId))
			.orderBy(desc(pageBlocks.order))
			.limit(1);
		const nextOrder = (last[0]?.order ?? 0) + 1024;
		await db.insert(pageBlocks).values({
			pageId: data.pageId,
			blockId: data.blockId,
			order: nextOrder,
		});
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { success: true };
	});

export const createAndAddBlockToPage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			pageId: z.string(),
			title: TitleSchema,
			body: z.string().default(""),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const conflict = await findTitleConflict(data.teamId, data.title);
		if (conflict) throw new Error("Title already in use in this team");
		const blockId = crypto.randomUUID();
		await db.insert(blocks).values({
			id: blockId,
			teamId: data.teamId,
			body: data.body,
		});
		await db.insert(titles).values({
			teamId: data.teamId,
			title: data.title.trim(),
			titleLower: normalize(data.title),
			kind: "block",
			refId: blockId,
		});
		const last = await db
			.select({ order: pageBlocks.order })
			.from(pageBlocks)
			.where(eq(pageBlocks.pageId, data.pageId))
			.orderBy(desc(pageBlocks.order))
			.limit(1);
		const nextOrder = (last[0]?.order ?? 0) + 1024;
		await db.insert(pageBlocks).values({
			pageId: data.pageId,
			blockId,
			order: nextOrder,
		});
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { blockId };
	});

export const unlinkBlockFromPage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			blockId: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		await db
			.delete(pageBlocks)
			.where(
				and(
					eq(pageBlocks.pageId, data.pageId),
					eq(pageBlocks.blockId, data.blockId),
				),
			);
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { success: true };
	});

export const reorderPageBlocks = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			blockIds: z.array(z.string()),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const updates = data.blockIds.map((blockId, i) =>
			db
				.update(pageBlocks)
				.set({ order: (i + 1) * 1024 })
				.where(
					and(
						eq(pageBlocks.pageId, data.pageId),
						eq(pageBlocks.blockId, blockId),
					),
				),
		);
		await Promise.all(updates);
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { success: true };
	});

export const deleteBlock = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), blockId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		await db
			.delete(titles)
			.where(and(eq(titles.kind, "block"), eq(titles.refId, data.blockId)));
		await db.delete(blocks).where(eq(blocks.id, data.blockId));
		return { success: true };
	});

export const deletePage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), pageId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		await db
			.delete(titles)
			.where(and(eq(titles.kind, "page"), eq(titles.refId, data.pageId)));
		await db.delete(pages).where(eq(pages.id, data.pageId));
		return { success: true };
	});

export const searchBacklinks = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			titles: z.array(z.string()),
			excludeBlockId: z.string().optional(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		if (data.titles.length === 0) return [];
		const conds = data.titles.map((t) => like(blocks.body, `%${t}%`));
		let where = and(eq(blocks.teamId, data.teamId), or(...conds));
		if (data.excludeBlockId) {
			where = and(where, ne(blocks.id, data.excludeBlockId));
		}
		const candidates = await db.select().from(blocks).where(where);
		if (candidates.length === 0) return [];
		const ids = candidates.map((b) => b.id);
		const titleRows = await db
			.select()
			.from(titles)
			.where(and(eq(titles.kind, "block"), inArray(titles.refId, ids)));
		const titlesByBlock = new Map<string, string[]>();
		for (const t of titleRows) {
			const arr = titlesByBlock.get(t.refId) ?? [];
			arr.push(t.title);
			titlesByBlock.set(t.refId, arr);
		}
		const lowerSearches = data.titles.map((t) => t.toLowerCase());
		return candidates
			.filter((b) => {
				const lowerBody = b.body.toLowerCase();
				return lowerSearches.some((s) => lowerBody.includes(s));
			})
			.map((b) => ({
				id: b.id,
				titles: titlesByBlock.get(b.id) ?? [],
				updatedAt: b.updatedAt,
			}));
	});

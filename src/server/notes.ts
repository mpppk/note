import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gt, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import { member } from "#/db/auth-schema";
import { pageSections, pages, titles } from "#/db/schema";
import { authMiddleware } from "#/server/middleware";

async function requireOrgMember(orgId: string, userId: string) {
	const [row] = await db
		.select()
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
		.limit(1);
	if (!row) throw new Error("Forbidden: not a member of this organization");
	return row;
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

// ─── Page CRUD ───────────────────────────────────────────────────────────────

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
			.where(inArray(titles.refId, pageIds));
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

export const getPage = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), pageId: z.string() }))
	.handler(async ({ data, context }) => {
		const [[page]] = await Promise.all([
			db.select().from(pages).where(eq(pages.id, data.pageId)).limit(1),
			requireOrgMember(data.orgId, context.user.id),
		]);
		if (!page) throw new Error("Page not found");
		const [pageTitles, sections] = await Promise.all([
			db
				.select()
				.from(titles)
				.where(eq(titles.refId, page.id))
				.orderBy(asc(titles.createdAt)),
			db
				.select()
				.from(pageSections)
				.where(eq(pageSections.pageId, page.id))
				.orderBy(asc(pageSections.order)),
		]);
		return {
			...page,
			titles: pageTitles.map((t) => t.title),
			sections,
		};
	});

export const createPage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			title: z.string().trim().min(1).max(200),
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
			refId: id,
		});
		return { id };
	});

export const deletePage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), pageId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		await db.delete(titles).where(eq(titles.refId, data.pageId));
		await db.delete(pages).where(eq(pages.id, data.pageId));
		return { success: true };
	});

// ─── Sections ────────────────────────────────────────────────────────────────

export const addTextSection = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			body: z.string().default(""),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const last = await db
			.select({ order: pageSections.order })
			.from(pageSections)
			.where(eq(pageSections.pageId, data.pageId))
			.orderBy(desc(pageSections.order))
			.limit(1);
		const nextOrder = (last[0]?.order ?? 0) + 1024;
		const id = crypto.randomUUID();
		await db.insert(pageSections).values({
			id,
			pageId: data.pageId,
			type: "text",
			body: data.body,
			order: nextOrder,
		});
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { id };
	});

export const addTextSectionAfter = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			afterSectionId: z.string(),
			body: z.string().default(""),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const [afterSection] = await db
			.select({ order: pageSections.order })
			.from(pageSections)
			.where(
				and(
					eq(pageSections.id, data.afterSectionId),
					eq(pageSections.pageId, data.pageId),
				),
			)
			.limit(1);
		if (!afterSection) throw new Error("Anchor section not found");
		const [nextSection] = await db
			.select({ order: pageSections.order })
			.from(pageSections)
			.where(
				and(
					eq(pageSections.pageId, data.pageId),
					gt(pageSections.order, afterSection.order),
				),
			)
			.orderBy(asc(pageSections.order))
			.limit(1);
		const newOrder = nextSection
			? (afterSection.order + nextSection.order) / 2
			: afterSection.order + 1024;
		const id = crypto.randomUUID();
		await db.insert(pageSections).values({
			id,
			pageId: data.pageId,
			type: "text",
			body: data.body,
			order: newOrder,
		});
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { id };
	});

export const addEmbedSection = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			embedPageId: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		// Verify embed target exists
		const [target] = await db
			.select()
			.from(pages)
			.where(eq(pages.id, data.embedPageId))
			.limit(1);
		if (!target) throw new Error("Embed target page not found");
		const last = await db
			.select({ order: pageSections.order })
			.from(pageSections)
			.where(eq(pageSections.pageId, data.pageId))
			.orderBy(desc(pageSections.order))
			.limit(1);
		const nextOrder = (last[0]?.order ?? 0) + 1024;
		const id = crypto.randomUUID();
		await db.insert(pageSections).values({
			id,
			pageId: data.pageId,
			type: "embed",
			embedPageId: data.embedPageId,
			order: nextOrder,
		});
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { id };
	});

export const addEmbedSectionAfter = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			afterSectionId: z.string(),
			embedPageId: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const [target] = await db
			.select()
			.from(pages)
			.where(eq(pages.id, data.embedPageId))
			.limit(1);
		if (!target) throw new Error("Embed target page not found");
		const [afterSection] = await db
			.select({ order: pageSections.order })
			.from(pageSections)
			.where(
				and(
					eq(pageSections.id, data.afterSectionId),
					eq(pageSections.pageId, data.pageId),
				),
			)
			.limit(1);
		if (!afterSection) throw new Error("Anchor section not found");
		const [nextSection] = await db
			.select({ order: pageSections.order })
			.from(pageSections)
			.where(
				and(
					eq(pageSections.pageId, data.pageId),
					gt(pageSections.order, afterSection.order),
				),
			)
			.orderBy(asc(pageSections.order))
			.limit(1);
		const newOrder = nextSection
			? (afterSection.order + nextSection.order) / 2
			: afterSection.order + 1024;
		const id = crypto.randomUUID();
		await db.insert(pageSections).values({
			id,
			pageId: data.pageId,
			type: "embed",
			embedPageId: data.embedPageId,
			order: newOrder,
		});
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { id };
	});

export const removeSection = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			sectionId: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		await db
			.delete(pageSections)
			.where(
				and(
					eq(pageSections.id, data.sectionId),
					eq(pageSections.pageId, data.pageId),
				),
			);
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, data.pageId));
		return { success: true };
	});

export const reorderSections = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			pageId: z.string(),
			sectionIds: z.array(z.string()),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		await db.batch([
			...data.sectionIds.map((sectionId, i) =>
				db
					.update(pageSections)
					.set({ order: (i + 1) * 1024 })
					.where(
						and(
							eq(pageSections.id, sectionId),
							eq(pageSections.pageId, data.pageId),
						),
					),
			),
			db
				.update(pages)
				.set({ updatedAt: new Date() })
				.where(eq(pages.id, data.pageId)),
		] as unknown as Parameters<typeof db.batch>[0]);
		return { success: true };
	});

export const updateSectionBody = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			sectionId: z.string(),
			body: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const [section] = await db
			.select()
			.from(pageSections)
			.where(eq(pageSections.id, data.sectionId))
			.limit(1);
		if (!section) throw new Error("Section not found");
		if (section.type !== "text")
			throw new Error("Only text sections can be edited");
		await db
			.update(pageSections)
			.set({ body: data.body, updatedAt: new Date() })
			.where(eq(pageSections.id, data.sectionId));
		// Also update parent page timestamp
		await db
			.update(pages)
			.set({ updatedAt: new Date() })
			.where(eq(pages.id, section.pageId));
		return { success: true };
	});

// ─── Embed (recursive fetch) ────────────────────────────────────────────────

export const getPageWithEmbeds = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), pageId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);

		// Step 1: 再帰CTEで到達可能な全ページIDをDBで一括取得（深さ・幅によらず1クエリ）
		// UNIONで重複排除するため循環参照があっても無限ループにならない
		const reachableRows = await db.all<{ pageId: string }>(sql`
			WITH RECURSIVE reachable(pageId) AS (
				SELECT id AS pageId FROM pages WHERE id = ${data.pageId}
				UNION
				SELECT ps.embedPageId
				FROM page_sections ps
				JOIN reachable r ON ps.pageId = r.pageId
				WHERE ps.type = 'embed' AND ps.embedPageId IS NOT NULL
			)
			SELECT pageId FROM reachable
		`);
		const allPageIds = reachableRows.map((r) => r.pageId);

		// Step 2: 全ページデータを3並列バッチ取得
		const [pageRows, titleRows, sectionRows] = await Promise.all([
			db.select().from(pages).where(inArray(pages.id, allPageIds)),
			db
				.select()
				.from(titles)
				.where(inArray(titles.refId, allPageIds))
				.orderBy(asc(titles.createdAt)),
			db
				.select()
				.from(pageSections)
				.where(inArray(pageSections.pageId, allPageIds))
				.orderBy(asc(pageSections.order)),
		]);

		// Step 3: pageId → データのマップを構築
		type PageEntry = {
			page: typeof pages.$inferSelect;
			pageTitles: (typeof titles.$inferSelect)[];
			sections: (typeof pageSections.$inferSelect)[];
		};
		const pageDataMap = new Map<string, PageEntry>();
		for (const page of pageRows) {
			pageDataMap.set(page.id, {
				page,
				pageTitles: titleRows.filter((t) => t.refId === page.id),
				sections: sectionRows.filter((s) => s.pageId === page.id),
			});
		}

		// Step 4: メモリ上でツリーを組み立て（visitedで循環参照を保護）
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

		function buildPage(
			pageId: string,
			visited: Set<string>,
		): { id: string; titles: string[]; sections: SectionData[] } | null {
			if (visited.has(pageId)) return null;
			visited.add(pageId);
			const entry = pageDataMap.get(pageId);
			if (!entry) return null;

			const sections: SectionData[] = entry.sections.map((s) => {
				const sd: SectionData = {
					id: s.id,
					type: s.type as "text" | "embed",
					body: s.body,
					order: s.order,
					embedPageId: s.embedPageId,
				};
				if (s.type === "embed" && s.embedPageId) {
					sd.embedPage = buildPage(s.embedPageId, new Set(visited));
				}
				return sd;
			});

			return {
				id: entry.page.id,
				titles: entry.pageTitles.map((t) => t.title),
				sections,
			};
		}

		const result = buildPage(data.pageId, new Set());
		if (!result) throw new Error("Page not found");
		return result;
	});

// ─── Titles ──────────────────────────────────────────────────────────────────

export const listTeamTitles = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), teamId: z.string() }))
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		return db
			.select({
				title: titles.title,
				refId: titles.refId,
			})
			.from(titles)
			.where(eq(titles.teamId, data.teamId));
	});

export const addTitle = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			refId: z.string(),
			title: z.string().trim().min(1).max(200),
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
			refId: z.string(),
			title: z.string(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		const remaining = await db
			.select()
			.from(titles)
			.where(and(eq(titles.teamId, data.teamId), eq(titles.refId, data.refId)));
		if (remaining.length <= 1) {
			throw new Error("Cannot remove the only remaining title");
		}
		await db
			.delete(titles)
			.where(
				and(
					eq(titles.teamId, data.teamId),
					eq(titles.refId, data.refId),
					eq(titles.titleLower, normalize(data.title)),
				),
			);
		return { success: true };
	});

// ─── Backlinks ───────────────────────────────────────────────────────────────

export const searchBacklinks = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			teamId: z.string(),
			titles: z.array(z.string()),
			excludePageId: z.string().optional(),
		}),
	)
	.handler(async ({ data, context }) => {
		await requireOrgMember(data.orgId, context.user.id);
		if (data.titles.length === 0) return [];

		// Find text sections that contain any of the titles
		const conds = data.titles.map((t) => like(pageSections.body, `%${t}%`));

		// Join with pages to filter by team
		const candidates = await db
			.select({
				sectionId: pageSections.id,
				pageId: pageSections.pageId,
				body: pageSections.body,
				teamId: pages.teamId,
			})
			.from(pageSections)
			.innerJoin(pages, eq(pages.id, pageSections.pageId))
			.where(
				and(
					eq(pages.teamId, data.teamId),
					eq(pageSections.type, "text"),
					or(...conds),
				),
			);

		// Filter candidates further (exact case-insensitive match)
		const lowerSearches = data.titles.map((t) => t.toLowerCase());
		const matchingPageIds = new Set<string>();
		for (const c of candidates) {
			if (data.excludePageId && c.pageId === data.excludePageId) continue;
			const lowerBody = c.body.toLowerCase();
			if (lowerSearches.some((s) => lowerBody.includes(s))) {
				matchingPageIds.add(c.pageId);
			}
		}

		if (matchingPageIds.size === 0) return [];
		const ids = Array.from(matchingPageIds);

		// Get titles for matching pages
		const titleRows = await db
			.select()
			.from(titles)
			.where(inArray(titles.refId, ids));
		const titlesByPage = new Map<string, string[]>();
		for (const t of titleRows) {
			const arr = titlesByPage.get(t.refId) ?? [];
			arr.push(t.title);
			titlesByPage.set(t.refId, arr);
		}

		// Get page metadata
		const pageRows = await db
			.select()
			.from(pages)
			.where(inArray(pages.id, ids));

		return pageRows.map((p) => ({
			id: p.id,
			titles: titlesByPage.get(p.id) ?? [],
			updatedAt: p.updatedAt,
		}));
	});

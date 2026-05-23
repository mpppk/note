import { sql } from "drizzle-orm";
import {
	blob,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const pages = sqliteTable(
	"pages",
	{
		id: text().primaryKey(),
		teamId: text("team_id").notNull(),
		yjsState: blob("yjs_state"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("pages_team_idx").on(t.teamId)],
);

export const pageSections = sqliteTable(
	"page_sections",
	{
		id: text().primaryKey(),
		pageId: text("page_id")
			.notNull()
			.references(() => pages.id, { onDelete: "cascade" }),
		type: text({ enum: ["text", "embed"] }).notNull(),
		body: text().notNull().default(""),
		embedPageId: text("embed_page_id").references(() => pages.id, {
			onDelete: "set null",
		}),
		order: real().notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		index("page_sections_page_idx").on(t.pageId, t.order),
		index("page_sections_embed_idx").on(t.embedPageId),
	],
);

export const titles = sqliteTable(
	"titles",
	{
		id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		teamId: text("team_id").notNull(),
		title: text().notNull(),
		titleLower: text("title_lower").notNull(),
		refId: text("ref_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("titles_team_title_lower_idx").on(t.teamId, t.titleLower),
		index("titles_ref_idx").on(t.refId),
		index("titles_team_idx").on(t.teamId),
	],
);

import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
	id: integer({ mode: "number" }).primaryKey({
		autoIncrement: true,
	}),
	title: text().notNull(),
	description: text(),
	done: integer({ mode: "boolean" }).notNull().default(false),
	assigneeId: text("assignee_id"),
	teamId: text("team_id").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`,
	),
});

export const blocks = sqliteTable(
	"blocks",
	{
		id: text().primaryKey(),
		teamId: text("team_id").notNull(),
		body: text().notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("blocks_team_idx").on(t.teamId)],
);

export const pages = sqliteTable(
	"pages",
	{
		id: text().primaryKey(),
		teamId: text("team_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("pages_team_idx").on(t.teamId)],
);

export const titles = sqliteTable(
	"titles",
	{
		id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		teamId: text("team_id").notNull(),
		title: text().notNull(),
		titleLower: text("title_lower").notNull(),
		kind: text({ enum: ["block", "page"] }).notNull(),
		refId: text("ref_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("titles_team_title_lower_idx").on(t.teamId, t.titleLower),
		index("titles_ref_idx").on(t.kind, t.refId),
		index("titles_team_idx").on(t.teamId),
	],
);

export const pageBlocks = sqliteTable(
	"page_blocks",
	{
		pageId: text("page_id")
			.notNull()
			.references(() => pages.id, { onDelete: "cascade" }),
		blockId: text("block_id")
			.notNull()
			.references(() => blocks.id, { onDelete: "cascade" }),
		order: real().notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		primaryKey({ columns: [t.pageId, t.blockId] }),
		index("page_blocks_page_idx").on(t.pageId, t.order),
		index("page_blocks_block_idx").on(t.blockId),
	],
);

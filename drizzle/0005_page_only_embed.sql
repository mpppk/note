-- Migration: Block+Page → Page-only + Embed
-- 1. Create page_sections table
-- 2. Migrate blocks → pages & page_blocks → page_sections(embed)
-- 3. Migrate titles (remove kind column)
-- 4. Drop old tables

-- Step 1: Create page_sections table
CREATE TABLE `page_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`type` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`embed_page_id` text,
	`order` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`embed_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `page_sections_page_idx` ON `page_sections` (`page_id`, `order`);
--> statement-breakpoint
CREATE INDEX `page_sections_embed_idx` ON `page_sections` (`embed_page_id`);
--> statement-breakpoint

-- Step 2: Convert each block into a page + a text section holding its body
INSERT INTO `pages` (`id`, `team_id`, `created_at`, `updated_at`)
SELECT `id`, `team_id`, `created_at`, `updated_at` FROM `blocks`;
--> statement-breakpoint

-- For each converted block, create a text section with its body
INSERT INTO `page_sections` (`id`, `page_id`, `type`, `body`, `order`, `created_at`, `updated_at`)
SELECT
  `id` || '-s0',
  `id`,
  'text',
  `body`,
  1024,
  `created_at`,
  `updated_at`
FROM `blocks`;
--> statement-breakpoint

-- Step 3: Convert page_blocks entries into embed sections on the original pages
INSERT INTO `page_sections` (`id`, `page_id`, `type`, `body`, `embed_page_id`, `order`, `created_at`, `updated_at`)
SELECT
  `page_id` || '-' || `block_id`,
  `page_id`,
  'embed',
  '',
  `block_id`,
  `order`,
  `created_at`,
  `created_at`
FROM `page_blocks`;
--> statement-breakpoint

-- Step 4: Rebuild titles table without kind column
CREATE TABLE `titles_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`title` text NOT NULL,
	`title_lower` text NOT NULL,
	`ref_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `titles_new` (`id`, `team_id`, `title`, `title_lower`, `ref_id`, `created_at`)
SELECT `id`, `team_id`, `title`, `title_lower`, `ref_id`, `created_at` FROM `titles`;
--> statement-breakpoint
DROP TABLE `titles`;
--> statement-breakpoint
ALTER TABLE `titles_new` RENAME TO `titles`;
--> statement-breakpoint
CREATE UNIQUE INDEX `titles_team_title_lower_idx` ON `titles` (`team_id`, `title_lower`);
--> statement-breakpoint
CREATE INDEX `titles_ref_idx` ON `titles` (`ref_id`);
--> statement-breakpoint
CREATE INDEX `titles_team_idx` ON `titles` (`team_id`);
--> statement-breakpoint

-- Step 5: Drop old tables
DROP TABLE `page_blocks`;
--> statement-breakpoint
DROP TABLE `blocks`;

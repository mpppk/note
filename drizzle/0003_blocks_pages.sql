CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocks_team_idx` ON `blocks` (`team_id`);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pages_team_idx` ON `pages` (`team_id`);
--> statement-breakpoint
CREATE TABLE `titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`title` text NOT NULL,
	`title_lower` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `titles_team_title_lower_idx` ON `titles` (`team_id`,`title_lower`);
--> statement-breakpoint
CREATE INDEX `titles_ref_idx` ON `titles` (`kind`,`ref_id`);
--> statement-breakpoint
CREATE INDEX `titles_team_idx` ON `titles` (`team_id`);
--> statement-breakpoint
CREATE TABLE `page_blocks` (
	`page_id` text NOT NULL,
	`block_id` text NOT NULL,
	`order` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`page_id`, `block_id`),
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_blocks_page_idx` ON `page_blocks` (`page_id`,`order`);
--> statement-breakpoint
CREATE INDEX `page_blocks_block_idx` ON `page_blocks` (`block_id`);

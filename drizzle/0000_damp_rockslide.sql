CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`tags` text NOT NULL,
	`published_at` text,
	`content` text NOT NULL,
	`excerpt` text NOT NULL,
	`frontmatter` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_listing_idx` ON `posts` (`status`,`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_category_idx` ON `posts` (`category`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

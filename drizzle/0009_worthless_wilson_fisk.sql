CREATE TABLE `repository_snapshot_items` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`repository` text NOT NULL,
	`evidence` text NOT NULL,
	`overview` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repository_snapshot_items_created` ON `repository_snapshot_items` (`created_at`);--> statement-breakpoint
CREATE TABLE `repository_snapshot_state` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repository_snapshot_state_updated` ON `repository_snapshot_state` (`updated_at`);
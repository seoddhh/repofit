CREATE TABLE `agent_activity_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_activity_owner_expiry` ON `agent_activity_summaries` (`user_id`,`expires_at`);
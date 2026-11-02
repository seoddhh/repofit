CREATE TABLE `agent_usage_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`goal` text NOT NULL,
	`selected_skill_ids` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`message` text NOT NULL,
	`analysis` text,
	`coverage` text,
	`candidates` text NOT NULL,
	`report` text,
	`lease_hash` text,
	`lease_expires_at` text,
	`active_device_key` text
);
--> statement-breakpoint
CREATE INDEX `agent_usage_owner_expiry` ON `agent_usage_runs` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_usage_device_status` ON `agent_usage_runs` (`device_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_active_device` ON `agent_usage_runs` (`active_device_key`);
CREATE TABLE `agent_coach_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	`author` text NOT NULL,
	`message` text NOT NULL,
	`bundle` text NOT NULL,
	`narrative` text NOT NULL,
	`feedback` text NOT NULL,
	`lease_hash` text,
	`lease_expires_at` text
);
--> statement-breakpoint
CREATE INDEX `agent_coach_owner_expiry` ON `agent_coach_reports` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_coach_device_status` ON `agent_coach_reports` (`device_id`,`status`);
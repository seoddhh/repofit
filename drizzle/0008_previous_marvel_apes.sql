PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_usage_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text,
	`executor` text DEFAULT 'local' NOT NULL,
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
INSERT INTO `__new_agent_usage_runs`("id", "user_id", "device_id", "executor", "goal", "selected_skill_ids", "status", "revision", "created_at", "updated_at", "expires_at", "message", "analysis", "coverage", "candidates", "report", "lease_hash", "lease_expires_at", "active_device_key") SELECT "id", "user_id", "device_id", 'local', "goal", "selected_skill_ids", "status", "revision", "created_at", "updated_at", "expires_at", "message", "analysis", "coverage", "candidates", "report", "lease_hash", "lease_expires_at", "active_device_key" FROM `agent_usage_runs`;--> statement-breakpoint
DROP TABLE `agent_usage_runs`;--> statement-breakpoint
ALTER TABLE `__new_agent_usage_runs` RENAME TO `agent_usage_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_usage_owner_expiry` ON `agent_usage_runs` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_usage_device_status` ON `agent_usage_runs` (`device_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_active_device` ON `agent_usage_runs` (`active_device_key`);
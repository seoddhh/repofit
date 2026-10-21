CREATE TABLE `local_agent_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`pairing_hash` text,
	`pairing_expires_at` text NOT NULL,
	`token_hash` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text,
	`inventory` text
);

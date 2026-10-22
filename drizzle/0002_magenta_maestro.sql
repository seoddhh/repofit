CREATE INDEX `local_agent_owner_expiry` ON `local_agent_devices` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_agent_pairing_hash` ON `local_agent_devices` (`pairing_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_agent_token_hash` ON `local_agent_devices` (`token_hash`);
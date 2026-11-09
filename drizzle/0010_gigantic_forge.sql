CREATE TABLE `repository_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence` text NOT NULL,
	`overview` text NOT NULL,
	`collected_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `repository_materials` (`id`, `evidence`, `overview`, `collected_at`)
SELECT `repository`, `evidence`, `overview`, json_extract(`evidence`, '$.fetchedAt')
FROM `repository_snapshot_items` ORDER BY `created_at` DESC;

CREATE TABLE `editorial_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`evidence` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repository_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`evidence` text NOT NULL,
	`content` text NOT NULL,
	`generated_at` text NOT NULL
);

CREATE TABLE `detective_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`room_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_detective_rooms_expires_at` ON `detective_rooms` (`expires_at`);
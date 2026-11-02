CREATE TABLE `arena_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`owner` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_expiry` ON `arena_rooms` (`expires`);--> statement-breakpoint
CREATE INDEX `arena_owner` ON `arena_rooms` (`owner`);
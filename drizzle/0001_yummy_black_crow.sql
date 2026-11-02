CREATE TABLE `arena_commands` (
	`code` text NOT NULL,
	`player` text NOT NULL,
	`seq` integer NOT NULL,
	`received` integer NOT NULL,
	`command` text NOT NULL,
	PRIMARY KEY(`code`, `player`, `seq`)
);
--> statement-breakpoint
CREATE INDEX `arena_command_time` ON `arena_commands` (`code`,`received`);--> statement-breakpoint
ALTER TABLE `arena_rooms` ADD `lease_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `arena_rooms` ADD `lease_id` text DEFAULT '' NOT NULL;
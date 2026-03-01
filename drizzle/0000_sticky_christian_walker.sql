CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`message_uuid` text NOT NULL,
	`parent_uuid` text,
	`role` text NOT NULL,
	`raw_type` text NOT NULL,
	`user_type` text,
	`is_sidechain` integer DEFAULT false NOT NULL,
	`api_message_id` text,
	`model` text,
	`text_content` text,
	`thinking_content` text,
	`tool_use_json` text,
	`stop_reason` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_creation_tokens` integer,
	`cache_read_tokens` integer,
	`estimated_cost_usd` real,
	`timestamp` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_session` ON `messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_uuid` ON `messages` (`message_uuid`);--> statement-breakpoint
CREATE INDEX `idx_messages_parent` ON `messages` (`parent_uuid`);--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`timestamp`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_uuid` text NOT NULL,
	`tool_type` text DEFAULT 'claude-cli' NOT NULL,
	`project_path` text,
	`git_branch` text,
	`title` text,
	`cwd` text,
	`cli_version` text,
	`started_at` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`user_message_count` integer DEFAULT 0 NOT NULL,
	`assistant_message_count` integer DEFAULT 0 NOT NULL,
	`total_input_tokens` integer DEFAULT 0 NOT NULL,
	`total_output_tokens` integer DEFAULT 0 NOT NULL,
	`total_cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`total_cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_usd` real DEFAULT 0 NOT NULL,
	`source_file_path` text,
	`primary_model` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_uuid_unique` ON `sessions` (`session_uuid`);--> statement-breakpoint
CREATE INDEX `idx_sessions_project` ON `sessions` (`project_path`);--> statement-breakpoint
CREATE INDEX `idx_sessions_tool` ON `sessions` (`tool_type`);--> statement-breakpoint
CREATE INDEX `idx_sessions_last_activity` ON `sessions` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`last_byte_offset` integer DEFAULT 0 NOT NULL,
	`last_line_count` integer DEFAULT 0 NOT NULL,
	`last_file_size` integer DEFAULT 0 NOT NULL,
	`last_modified_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_state_file_path_unique` ON `sync_state` (`file_path`);--> statement-breakpoint
CREATE TABLE `watched_paths` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`tool_type` text DEFAULT 'claude-cli' NOT NULL,
	`label` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watched_paths_path_unique` ON `watched_paths` (`path`);
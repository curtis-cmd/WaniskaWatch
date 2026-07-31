CREATE TABLE `mining_asset_ownership` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`relationship_type` text DEFAULT 'recorded_holder' NOT NULL,
	`confidence` text DEFAULT 'verified' NOT NULL,
	`evidence_url` text NOT NULL,
	`evidence_date` text NOT NULL,
	`evidence_note` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mining_asset_territories` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`territory_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`assignment_method` text NOT NULL,
	`overlap_hectares` real,
	`overlap_percent` real,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mining_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`source_object_id` text NOT NULL,
	`disposition_number` text,
	`name` text,
	`asset_type` text NOT NULL,
	`status` text,
	`commodity` text,
	`area_hectares` real,
	`issue_date` text,
	`expiry_date` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`geometry_geojson` text,
	`source_url` text NOT NULL,
	`source_retrieved_at` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mining_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`recorded_name` text NOT NULL,
	`normalized_name` text,
	`entity_type` text DEFAULT 'unknown' NOT NULL,
	`parent_entity_id` text,
	`website` text,
	`registry_identifier` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mining_refresh_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`source_url` text NOT NULL,
	`records_seen` integer DEFAULT 0 NOT NULL,
	`records_added` integer DEFAULT 0 NOT NULL,
	`records_changed` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `mining_territories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`treaty_year` text,
	`boundary_source_url` text NOT NULL,
	`boundary_note` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mining_territories_name_unique` ON `mining_territories` (`name`);
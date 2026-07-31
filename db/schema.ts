import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
};

export const miningTerritories = sqliteTable("mining_territories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  treatyYear: text("treaty_year"),
  boundarySourceUrl: text("boundary_source_url").notNull(),
  boundaryNote: text("boundary_note").notNull(),
  ...timestamps,
});

export const miningAssets = sqliteTable("mining_assets", {
  id: text("id").primaryKey(),
  sourceObjectId: text("source_object_id").notNull(),
  dispositionNumber: text("disposition_number"),
  name: text("name"),
  assetType: text("asset_type").notNull(),
  status: text("status"),
  commodity: text("commodity"),
  areaHectares: real("area_hectares"),
  issueDate: text("issue_date"),
  expiryDate: text("expiry_date"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  geometryGeojson: text("geometry_geojson"),
  sourceUrl: text("source_url").notNull(),
  sourceRetrievedAt: text("source_retrieved_at").notNull(),
  ...timestamps,
});

export const miningAssetTerritories = sqliteTable("mining_asset_territories", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  territoryId: text("territory_id").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  assignmentMethod: text("assignment_method").notNull(),
  overlapHectares: real("overlap_hectares"),
  overlapPercent: real("overlap_percent"),
  ...timestamps,
});

export const miningEntities = sqliteTable("mining_entities", {
  id: text("id").primaryKey(),
  recordedName: text("recorded_name").notNull(),
  normalizedName: text("normalized_name"),
  entityType: text("entity_type").notNull().default("unknown"),
  parentEntityId: text("parent_entity_id"),
  website: text("website"),
  registryIdentifier: text("registry_identifier"),
  ...timestamps,
});

export const miningAssetOwnership = sqliteTable("mining_asset_ownership", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  entityId: text("entity_id").notNull(),
  relationshipType: text("relationship_type").notNull().default("recorded_holder"),
  confidence: text("confidence").notNull().default("verified"),
  evidenceUrl: text("evidence_url").notNull(),
  evidenceDate: text("evidence_date").notNull(),
  evidenceNote: text("evidence_note"),
  ...timestamps,
});

export const miningRefreshRuns = sqliteTable("mining_refresh_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  status: text("status").notNull(),
  sourceUrl: text("source_url").notNull(),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsAdded: integer("records_added").notNull().default(0),
  recordsChanged: integer("records_changed").notNull().default(0),
  notes: text("notes"),
});

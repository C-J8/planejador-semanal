-- Adds provider-agnostic progress sources, metrics and time-series observations.
CREATE TYPE "ProgressProvider" AS ENUM ('CHESS_COM', 'GYM_TRACKER', 'MANUAL');
CREATE TYPE "ProgressSyncStatus" AS ENUM ('NEVER_SYNCED', 'SUCCESS', 'ERROR');
CREATE TYPE "ProgressDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL');

CREATE TABLE "progress_sources" (
  "id" UUID NOT NULL,
  "provider" "ProgressProvider" NOT NULL,
  "external_account_id" VARCHAR(120) NOT NULL,
  "display_name" VARCHAR(120),
  "avatar_url" VARCHAR(500),
  "profile_url" VARCHAR(500),
  "activity_id" UUID,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_synced_at" TIMESTAMPTZ(3),
  "last_sync_status" "ProgressSyncStatus" NOT NULL DEFAULT 'NEVER_SYNCED',
  "last_sync_error" VARCHAR(500),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "progress_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "progress_sources_external_account_check" CHECK (btrim("external_account_id") <> '')
);

CREATE TABLE "progress_metrics" (
  "id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "unit" VARCHAR(24) NOT NULL,
  "color" VARCHAR(7) NOT NULL,
  "direction" "ProgressDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "progress_metrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "progress_metrics_key_check" CHECK (btrim("key") <> ''),
  CONSTRAINT "progress_metrics_label_check" CHECK (btrim("label") <> ''),
  CONSTRAINT "progress_metrics_unit_check" CHECK (btrim("unit") <> ''),
  CONSTRAINT "progress_metrics_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "progress_metrics_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE TABLE "progress_observations" (
  "id" UUID NOT NULL,
  "metric_id" UUID NOT NULL,
  "external_key" VARCHAR(300) NOT NULL,
  "observed_at" TIMESTAMPTZ(3) NOT NULL,
  "value" DECIMAL(14,3) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "progress_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "progress_observations_external_key_check" CHECK (btrim("external_key") <> '')
);

CREATE UNIQUE INDEX "progress_sources_provider_key" ON "progress_sources"("provider");
CREATE INDEX "progress_sources_activity_idx" ON "progress_sources"("activity_id");
CREATE UNIQUE INDEX "progress_metrics_source_key_key" ON "progress_metrics"("source_id", "key");
CREATE INDEX "progress_metrics_source_order_idx" ON "progress_metrics"("source_id", "sort_order");
CREATE UNIQUE INDEX "progress_observations_metric_external_key" ON "progress_observations"("metric_id", "external_key");
CREATE INDEX "progress_observations_metric_date_idx" ON "progress_observations"("metric_id", "observed_at");

ALTER TABLE "progress_sources" ADD CONSTRAINT "progress_sources_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "progress_metrics" ADD CONSTRAINT "progress_metrics_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "progress_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_observations" ADD CONSTRAINT "progress_observations_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "progress_metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

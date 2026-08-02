-- Stage 8 adds reusable weekly templates and finite activity recurrences.
ALTER TABLE "activity_occurrences"
  ALTER COLUMN "duration_minutes" DROP NOT NULL,
  ADD COLUMN "recurrence_id" UUID;

CREATE TABLE "weekly_templates" (
  "id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(240),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "weekly_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_templates_name_not_blank_check" CHECK (btrim("name") <> '')
);

CREATE TABLE "weekly_template_items" (
  "id" UUID NOT NULL,
  "weekly_template_id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "start_time" TIME(0),
  "duration_minutes" INTEGER,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "weekly_template_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_template_items_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "weekly_template_items_duration_check" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
  CONSTRAINT "weekly_template_items_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "activity_recurrences" (
  "id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "weekdays" INTEGER[] NOT NULL,
  "interval_weeks" INTEGER NOT NULL,
  "start_time" TIME(0),
  "duration_minutes" INTEGER,
  "cancelled_at" TIMESTAMPTZ(3),
  "cancelled_from_date" DATE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "activity_recurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_recurrences_dates_check" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "activity_recurrences_interval_check" CHECK ("interval_weeks" BETWEEN 1 AND 52),
  CONSTRAINT "activity_recurrences_weekdays_check" CHECK (cardinality("weekdays") BETWEEN 1 AND 7),
  CONSTRAINT "activity_recurrences_duration_check" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0)
);

CREATE INDEX "weekly_templates_updated_at_idx" ON "weekly_templates"("updated_at");
CREATE INDEX "weekly_template_items_order_idx" ON "weekly_template_items"("weekly_template_id", "weekday", "position");
CREATE INDEX "weekly_template_items_activity_idx" ON "weekly_template_items"("activity_id");
CREATE INDEX "activity_recurrences_activity_end_idx" ON "activity_recurrences"("activity_id", "end_date");
CREATE INDEX "activity_recurrences_state_idx" ON "activity_recurrences"("cancelled_at", "end_date");
CREATE INDEX "activity_occurrences_recurrence_date_idx" ON "activity_occurrences"("recurrence_id", "scheduled_date");
CREATE UNIQUE INDEX "activity_occurrences_recurrence_date_key" ON "activity_occurrences"("recurrence_id", "scheduled_date");

ALTER TABLE "weekly_template_items" ADD CONSTRAINT "weekly_template_items_weekly_template_id_fkey" FOREIGN KEY ("weekly_template_id") REFERENCES "weekly_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_template_items" ADD CONSTRAINT "weekly_template_items_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_recurrences" ADD CONSTRAINT "activity_recurrences_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_occurrences" ADD CONSTRAINT "activity_occurrences_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "activity_recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

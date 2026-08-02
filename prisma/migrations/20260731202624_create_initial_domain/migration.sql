-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "icon" VARCHAR(32),
    "default_duration_minutes" INTEGER NOT NULL,
    "default_start_time" TIME(0),
    "description" VARCHAR(2000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_occurrences" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "start_time" TIME(0),
    "duration_minutes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" VARCHAR(2000),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "event_date" DATE NOT NULL,
    "start_time" TIME(0),
    "duration_minutes" INTEGER,
    "description" VARCHAR(2000),
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activities_name_key" ON "activities"("name");

-- CreateIndex
CREATE INDEX "activities_active_name_idx" ON "activities"("active", "name");

-- CreateIndex
CREATE INDEX "activity_occurrences_date_position_idx" ON "activity_occurrences"("scheduled_date", "position");

-- CreateIndex
CREATE INDEX "activity_occurrences_activity_date_idx" ON "activity_occurrences"("activity_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "activity_occurrences_status_date_idx" ON "activity_occurrences"("status", "scheduled_date");

-- CreateIndex
CREATE INDEX "events_date_idx" ON "events"("event_date");

-- CreateIndex
CREATE INDEX "events_date_status_idx" ON "events"("event_date", "status");

-- AddForeignKey
ALTER TABLE "activity_occurrences" ADD CONSTRAINT "activity_occurrences_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants not expressible in the Prisma schema
ALTER TABLE "activities"
    ADD CONSTRAINT "activities_name_not_blank_check" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "activities_color_hex_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$'),
    ADD CONSTRAINT "activities_duration_positive_check" CHECK ("default_duration_minutes" > 0),
    ADD CONSTRAINT "activities_archive_state_check" CHECK (
        ("active" = true AND "archived_at" IS NULL) OR
        ("active" = false AND "archived_at" IS NOT NULL)
    );

ALTER TABLE "activity_occurrences"
    ADD CONSTRAINT "activity_occurrences_duration_positive_check" CHECK ("duration_minutes" > 0),
    ADD CONSTRAINT "activity_occurrences_position_nonnegative_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "activity_occurrences_completion_state_check" CHECK (
        ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL) OR
        ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
    );

ALTER TABLE "events"
    ADD CONSTRAINT "events_title_not_blank_check" CHECK (btrim("title") <> ''),
    ADD CONSTRAINT "events_duration_positive_check" CHECK (
        "duration_minutes" IS NULL OR "duration_minutes" > 0
    );

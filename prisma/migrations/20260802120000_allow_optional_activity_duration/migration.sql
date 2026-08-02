-- Stage 9 correction: an activity may intentionally have no default duration.
-- The existing positive-value CHECK already accepts NULL values.
ALTER TABLE "activities"
  ALTER COLUMN "default_duration_minutes" DROP NOT NULL;

-- Migration: 20260802000000_add_floor_plan_fields.sql
-- Add floor plan URL to properties and floor plan pin coordinates (fp_x, fp_y) to property_media

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "floor_plan_url" VARCHAR(500);

ALTER TABLE "property_media"
  ADD COLUMN IF NOT EXISTS "fp_x" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fp_y" DOUBLE PRECISION;

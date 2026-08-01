-- Ethred Virtual Tour Migration
-- SRS Reference: SRS-ETHRED-2026-VT-1.0 §6.2
-- Safe to run on production: all changes are purely additive.
-- Generated: 2026-08-01

BEGIN;

-- ── Step 1: Add tour fields to property_media ────────────────────────────────
ALTER TABLE property_media
  ADD COLUMN IF NOT EXISTS is_tour_scene  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scene_name     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS initial_yaw    DECIMAL(6,2)          DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS needs_repair   BOOLEAN      NOT NULL DEFAULT FALSE;

-- ── Step 2: Add Matterport embed URL to properties ───────────────────────────
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS external_tour_url VARCHAR(500);

-- ── Step 3: Create HotspotType enum ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hotspot_type') THEN
    CREATE TYPE hotspot_type AS ENUM ('NAVIGATION', 'INFO');
  END IF;
END$$;

-- ── Step 4: Create hotspots table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotspots (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id         UUID         NOT NULL REFERENCES property_media(id) ON DELETE CASCADE,
  type             hotspot_type NOT NULL,
  yaw              DECIMAL(7,4) NOT NULL CHECK (yaw >= 0 AND yaw < 360),
  pitch            DECIMAL(7,4) NOT NULL CHECK (pitch >= -90 AND pitch <= 90),
  target_scene_id  UUID         REFERENCES property_media(id) ON DELETE SET NULL,
  label            VARCHAR(255),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- Enforce: NAVIGATION hotspots MUST have a target_scene_id
  -- (Prisma cannot express this; we enforce at DB level too)
  CONSTRAINT navigation_requires_target CHECK (
    type != 'NAVIGATION' OR target_scene_id IS NOT NULL
  )
);

-- ── Step 5: Performance indexes ──────────────────────────────────────────────

-- Fast tour config generation: only scan tour scenes for a given property
CREATE INDEX IF NOT EXISTS idx_property_media_tour_scenes
  ON property_media(property_id)
  WHERE is_tour_scene = TRUE;

-- Fast repair worker poll: only scan scenes that need repair
CREATE INDEX IF NOT EXISTS idx_property_media_needs_repair
  ON property_media(needs_repair)
  WHERE needs_repair = TRUE;

-- Fast hotspot lookup by scene
CREATE INDEX IF NOT EXISTS idx_hotspots_scene_id
  ON hotspots(scene_id);

COMMIT;

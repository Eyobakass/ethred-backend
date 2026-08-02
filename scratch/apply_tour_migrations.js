/**
 * apply_tour_migrations.js
 * Applies the two 3D Virtual Tour SQL migrations directly via pg client.
 * Safe to run multiple times — all statements use IF NOT EXISTS.
 * 
 * Usage: node scratch/apply_tour_migrations.js
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required.');
  process.exit(1);
}

const MIGRATION_1 = `
-- ── Step 1: Add tour fields to property_media ──
ALTER TABLE property_media
  ADD COLUMN IF NOT EXISTS is_tour_scene  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scene_name     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS initial_yaw    DECIMAL(6,2)          DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS needs_repair   BOOLEAN      NOT NULL DEFAULT FALSE;

-- ── Step 2: Add Matterport embed URL to properties ──
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS external_tour_url VARCHAR(500);

-- ── Step 3: Create HotspotType enum ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hotspot_type') THEN
    CREATE TYPE hotspot_type AS ENUM ('NAVIGATION', 'INFO');
  END IF;
END$$;

-- ── Step 4: Create hotspots table ──
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
  CONSTRAINT navigation_requires_target CHECK (
    type != 'NAVIGATION' OR target_scene_id IS NOT NULL
  )
);

-- ── Step 5: Indexes ──
CREATE INDEX IF NOT EXISTS idx_property_media_tour_scenes
  ON property_media(property_id)
  WHERE is_tour_scene = TRUE;

CREATE INDEX IF NOT EXISTS idx_property_media_needs_repair
  ON property_media(needs_repair)
  WHERE needs_repair = TRUE;

CREATE INDEX IF NOT EXISTS idx_hotspots_scene_id
  ON hotspots(scene_id);
`;

const MIGRATION_2 = `
-- ── Step 6: Add floor plan URL + pin coordinates ──
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floor_plan_url VARCHAR(500);

ALTER TABLE property_media
  ADD COLUMN IF NOT EXISTS fp_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fp_y DOUBLE PRECISION;
`;

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    statement_timeout: 30000,
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✓ Connected.\n');

    console.log('▶ Applying Migration 1: Virtual tour fields + Hotspot table...');
    await client.query(MIGRATION_1);
    console.log('✓ Migration 1 applied.\n');

    console.log('▶ Applying Migration 2: Floor plan URL + pin coordinates...');
    await client.query(MIGRATION_2);
    console.log('✓ Migration 2 applied.\n');

    // Verify
    console.log('🔍 Verifying schema...');
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'property_media'
        AND column_name IN ('is_tour_scene', 'scene_name', 'initial_yaw', 'needs_repair', 'fp_x', 'fp_y')
      ORDER BY column_name;
    `);
    const hotspotCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'hotspots'
      ) AS hotspots_exist;
    `);
    const fpCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'properties' AND column_name = 'floor_plan_url'
      ) AS floor_plan_url_exist;
    `);

    console.log('\n================================================');
    console.log('✅ ALL MIGRATIONS APPLIED SUCCESSFULLY!');
    console.log('================================================');
    console.log('property_media tour columns:', colCheck.rows.map(r => r.column_name).join(', '));
    console.log('hotspots table exists      :', hotspotCheck.rows[0].hotspots_exist);
    console.log('floor_plan_url on properties:', fpCheck.rows[0].floor_plan_url_exist);
    console.log('================================================\n');
    console.log('🚀 Your 3D Virtual Tour API is now live on Render!');
    console.log('   Next: run node scratch/create_test_property.js to seed a test property.\n');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();

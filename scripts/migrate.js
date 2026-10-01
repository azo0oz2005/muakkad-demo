'use strict';

const { pool } = require('../src/db');

const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS offices (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name TEXT NOT NULL,
  logo_url TEXT,
  brand_colors JSONB NOT NULL DEFAULT '{"ink":"#1f2a4f","accent":"#5a6690"}'::jsonb,
  whatsapp TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  duration_min INTEGER NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 10 AND 240),
  periods JSONB NOT NULL DEFAULT '["صباحًا (9–12)","ظهرًا (12–4)","مساءً (4–9)"]'::jsonb,
  all_days BOOLEAN NOT NULL DEFAULT FALSE,
  case_types JSONB NOT NULL DEFAULT '{}'::jsonb,
  bank_name TEXT,
  account_name TEXT,
  iban TEXT,
  cancel_policy TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  trial_ends_at TIMESTAMPTZ,
  plan_status TEXT NOT NULL DEFAULT 'trial' CHECK (plan_status IN ('trial','active','paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE offices ADD COLUMN IF NOT EXISTS preview_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner_admin','lawyer')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id BIGINT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  ref TEXT UNIQUE NOT NULL,
  case_type TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary VARCHAR(300),
  client_name TEXT,
  client_phone TEXT,
  preferred_day TEXT,
  preferred_period TEXT,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','submitted','awaiting_payment','paid','confirmed','cancelled','no_show')),
  followup_status TEXT NOT NULL DEFAULT 'none' CHECK (followup_status IN ('none','followed','not_interested')),
  last_step INTEGER NOT NULL DEFAULT 1 CHECK (last_step BETWEEN 1 AND 6),
  session_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('visit','started','step_reached','submitted')),
  step INTEGER,
  session_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_office_status_idx ON bookings(office_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS bookings_session_idx ON bookings(office_id, session_hash);
CREATE INDEX IF NOT EXISTS events_office_created_idx ON events(office_id, created_at DESC);

ALTER TABLE offices ADD COLUMN IF NOT EXISTS workspace_config JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS appointment_end TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT 'consultation';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_label TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quoted_price INTEGER CHECK (quoted_price >= 0);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quote_note TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS bookings_appointment_idx ON bookings(office_id, appointment_at);
CREATE TABLE IF NOT EXISTS calendar_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id BIGINT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  CHECK (ends_at > starts_at)
);
`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function migrateWithRetry(maxAttempts = 12) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query(sql);
      return;
    } catch (error) {
      const retryable = ['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH'].includes(error.code);
      if (!retryable || attempt === maxAttempts) throw error;
      console.warn(`Database not ready (attempt ${attempt}/${maxAttempts}); retrying in 5s`);
      await wait(5000);
    }
  }
}

(async () => {
  try {
    await migrateWithRetry();
    console.log('Database migrated');
  } finally {
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exit(1); });

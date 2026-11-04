-- Asylum Community Official Dashboard on Neon.
-- Only the official dashboard tables are copied; Recruitment stays in Supabase.
CREATE TABLE IF NOT EXISTS identities (
  user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_applications (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 2 AND 60),
  ign text NOT NULL CHECK (char_length(trim(ign)) BETWEEN 2 AND 40),
  uid text NOT NULL CHECK (char_length(trim(uid)) BETWEEN 3 AND 40),
  photo_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  display_name text NOT NULL,
  ign text,
  uid text,
  team text,
  role text NOT NULL DEFAULT 'Member',
  photo_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_admins (
  user_id uuid PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('owner','management','moderator','admin')),
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_applications_status ON member_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at DESC);
-- All connections are server-only using DATABASE_URL. Never expose a Neon SQL URL to the browser.

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
  streamer_mode_id text CHECK (streamer_mode_id IS NULL OR char_length(streamer_mode_id) <= 100),
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
  streamer_mode_id text CHECK (streamer_mode_id IS NULL OR char_length(streamer_mode_id) <= 100),
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

-- Safe upgrade for databases created before Streamer Mode ID was added.
ALTER TABLE members ADD COLUMN IF NOT EXISTS streamer_mode_id text;
ALTER TABLE member_applications ADD COLUMN IF NOT EXISTS streamer_mode_id text;


-- Official community portal content; editable only through authenticated staff APIs.
CREATE TABLE IF NOT EXISTS community_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '',
  logo_url text,
  captain_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_team_members (
  team_id uuid NOT NULL REFERENCES community_teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id,member_id)
);
CREATE TABLE IF NOT EXISTS community_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 120),
  subtitle text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  badge text NOT NULL DEFAULT 'ACHIEVEMENT',
  image_url text,
  achieved_on date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 120),
  caption text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'COMMUNITY',
  image_url text NOT NULL CHECK (image_url ~ '^https://'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_management_profiles (
  user_id uuid PRIMARY KEY REFERENCES community_admins(user_id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  photo_url text,
  sort_order integer NOT NULL DEFAULT 0,
  show_public boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON community_team_members(member_id);
CREATE INDEX IF NOT EXISTS idx_achievements_order ON community_achievements(sort_order,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_order ON community_gallery(sort_order,created_at DESC);

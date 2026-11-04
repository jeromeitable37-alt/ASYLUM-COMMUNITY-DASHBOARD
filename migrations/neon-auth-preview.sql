-- PREVIEW BRANCH ONLY: identity linking for the future Neon Auth cutover.
-- Never run this migration on production before the new auth session verification
-- and per-account migration have passed their security tests.
-- A verified Neon Auth identity may be associated with exactly one legacy
-- dashboard UUID, preserving member, Owner and Admin records.
CREATE TABLE IF NOT EXISTS portal_auth_migration_links (
  neon_subject text PRIMARY KEY,
  dashboard_user_id uuid NOT NULL UNIQUE,
  verified_email text NOT NULL,
  created_at timestamptz DEFAULT now()
);
-- Required before any data is written:
-- 1. Verify the Neon-issued token signature, issuer, audience and expiry.
-- 2. Query the Neon Auth user table and require emailVerified=true.
-- 3. Compare normalized verified email against identities.email.
-- 4. Reject ambiguous matches and simultaneous claims of one UUID.
-- 5. Make the link in a single server-side transaction.
-- 6. Treat identity.user_id as the canonical owner of existing application data.
-- 7. Do not read, write, or delete Supabase authentication or Recruitment tables.

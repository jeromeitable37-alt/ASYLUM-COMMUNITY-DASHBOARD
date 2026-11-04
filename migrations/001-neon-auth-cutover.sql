-- Neon Auth cutover — apply first to an isolated Neon branch.
-- This maps verified new login identities to existing official dashboard UUIDs.
-- It NEVER reads or mutates any Supabase tables.
CREATE TABLE IF NOT EXISTS portal_auth_migration_links (
  neon_subject text PRIMARY KEY,
  dashboard_user_id uuid NOT NULL UNIQUE REFERENCES identities(user_id) ON DELETE RESTRICT,
  verified_email text NOT NULL CHECK (length(trim(verified_email)) >= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_auth_migration_links_email_idx
  ON portal_auth_migration_links (lower(verified_email));

-- IMPORTANT: Require verified Neon Auth emails before linking.
-- For existing Owner/Admin accounts, link only AFTER explicit review
-- of the verified Neon Auth user and corresponding legacy identity:
--
-- INSERT INTO portal_auth_migration_links(neon_subject,dashboard_user_id,verified_email)
-- SELECT u.id::text, i.user_id, lower(i.email)
-- FROM neon_auth."user" u
-- JOIN identities i ON lower(i.email)=lower(u.email)
-- JOIN community_admins a ON a.user_id=i.user_id
-- WHERE u."emailVerified"=true AND u.banned=false
--   AND i.portal_status='active' AND lower(i.email)=lower('<verified staff email>')
-- ON CONFLICT DO NOTHING;
--
-- Never insert all unverified users in bulk. Never trust a client supplied role.
-- New authenticated users are linked to the dashboard by API after verification.

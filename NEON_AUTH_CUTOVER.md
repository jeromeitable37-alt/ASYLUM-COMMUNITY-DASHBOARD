# ASYLUM Community — Neon Auth Cutover Runbook

**Scope:** Official Dashboard only. Do not modify, delete, or reconfigure shared Supabase Auth, Recruitment, or Jersey. Existing official member data and permissions stay in the original Neon database.

## Prepared on November 4, 2026

- Created the isolated GitHub branches `neon-auth-preview` (login sandbox) and `neon-auth-cutover-ready` (full website migration).
- Enabled Managed Better Auth on a separate Neon database branch `preview-neon-auth-migration`.
- Added the `portal_auth_migration_links` table to the Preview **and** Main Neon database. It maps new verified auth subjects to the canonical old Dashboard UUID, preserving member records and roles.
- Enabled Neon Auth on the Main Neon branch without connecting it to the live website.
- Created `asylum-community-images` buckets on both Neon branches, public-read with authenticated uploads.
- Added JWT verification using Neon's branch-specific JWKS, user lookup in `neon_auth."user"`, email verification and banned-user checks.
- Updated protected Dashboard and Showcase APIs to use only validated Neon Auth identities.
- Added Neon signup, OTP entry/resend, login and profile-completion screens; mandatory Streamer Mode ID remains enforced.
- Added presigned Neon Storage upload endpoint for JPG/PNG/WebP images no larger than 5MB. Old public photo URLs continue to display read-only; no Supabase files are deleted.
- No changes to the **production Vercel deployment** or the separate Recruitment/Jersey code.

## Blocking prerequisites before any cutover

1. **Enable email verification in Neon Auth Console.** Current defaults for both branches are `verify_email_on_sign_up: false` and `require_email_verification: false`. Open Neon Console -> this project's Auth -> Email / Email & Password settings. Turn on **Verify email on sign-up**, **Require email verification** and use **OTP**. The Dashboard API already refuses every unverified identity, including new accounts. Email OTP must be tested; if delivery fails, DO NOT activate cutover.
2. **Configure reliable production email sending.** Neon shared SMTP is okay to test OTP, but production needs a custom SMTP provider and verified sender domain. Its default service is not an unlimited replacement for email delivery. Don't disable verification to bypass rate limits.
3. **Restore Vercel team access.** The connected Vercel app received a 403 for the project's environment variables; the Owner must authorize its Vercel team connection before the agent can add branch-specific secrets.
4. **Preview environment.** Add all keys from `.env.neon-auth.example` ONLY to the `neon-auth-cutover-ready` Preview git branch on the existing Vercel Dashboard project. Use the connection string for Neon **preview** branch `br-shiny-snow-ao71flcj`, never the production database. Issue scoped Neon Storage credentials for that branch and store them encrypted in Vercel. Do not place secrets in GitHub.
5. **Enable the gate only for preview.** Set `NEON_AUTH_CUTOVER_ENABLED=true` in the branch-specific Preview environment once verification and environment values are configured.
6. **Allow the exact preview origin.** Add the Vercel Preview URL as a trusted domain to the preview Neon Auth branch (not the production branch). Main website domain is already on the Main Neon Auth allowlist.
7. **Run CI and test uploads.** Require typecheck, Vite build, signup -> code -> login -> session restore, member application creation, Admin role checks, logout, OTP resend, mobile registration, and JPG/PNG/WebP photo upload. Check Neon Object Storage CORS for signed PUT. A Vercel READY build alone is not a successful authentication test.

## Preserve legacy Admin and Owner identities

**Never auto-promote a newly created Neon account to Owner or Admin.** A valid JWT and a verified Neon email are mandatory; matching the email by itself does **not** grant a staff role. The canonical dashboard account IDs remain in `identities` and `community_admins`.

Existing members can automatically link to a verified Neon Auth login using their old email. **Staff and Owner require an explicit Owner-reviewed link** after signing up with Neon Auth and completing OTP verification.

Once the exact staff account has been verified and reviewed, connect only that account:

```sql
INSERT INTO portal_auth_migration_links
  (neon_subject, dashboard_user_id, verified_email)
SELECT u.id::text, i.user_id, lower(i.email)
FROM neon_auth."user" u
JOIN identities i ON lower(i.email)=lower(u.email)
JOIN community_admins ca ON ca.user_id=i.user_id
WHERE u."emailVerified"=true AND u.banned=false
  AND i.portal_status='active'
  AND lower(i.email)=lower('the-reviewed-staff-email@example.com')
ON CONFLICT DO NOTHING;
```

Run a `SELECT` first and confirm exactly one staff record and matching Neon user. Never bulk-link staff identities. Do not copy password hashes or transfer sessions from shared Supabase. The member sets a **new Neon Auth password**.

## Production launch (after preview passes)

1. Take a Neon Main snapshot/restore point; verify member and admin counts, pending applications, and Owner permissions.
2. Configure Main Neon Auth required verification + production SMTP; use a dedicated Main-branch storage credential and the public Main Auth/JWKS URLs. Do **not** reuse Preview secrets.
3. Complete the verified Owner's mapping on Main, and test Owner sign-in using a non-production preview/staging run first. Confirm Admin list and Owner controls; staff mappings require explicit approval.
4. Merge `neon-auth-cutover-ready` into `main` only after passing verification and migration checks. The Main deployment then uses the Main Neon Auth URL/JWKS, Main `DATABASE_URL`, Main storage endpoint, and `NEON_AUTH_CUTOVER_ENABLED=true`.
5. Test GET `/api/dashboard?action=health`, actual register/OTP/signin, member directory, approved/pending status, secure role changes, Archive/Restore and uploads in production.
6. Tell existing members that they must create/verify a new Neon Auth password; **they must not re-apply** if they already have approved membership.
7. Monitor errors. If cutover fails, roll back to the previous Vercel production deployment. Keep both Auth and all member rows; don't delete either old or new users while troubleshooting.

## Readiness status

- **Prepared:** isolated Neon services, branches, public storage buckets, cutover API code, client code, and SQL identity mapping. Existing official data not deleted.
- **Not verified:** Neon OTP delivery/settings, SDK integration in a live browser, CI/build status, server JWT verification with a real session, object upload CORS, and actual legacy Owner login.
- **Blocked:** preview Vercel environment authorization and earlier Hobby build-rate limits.
- **Not safe yet:** production cutover, bulk registration or assuming old Supabase passwords still work.

No deploy should occur until every blocking prerequisite is cleared.

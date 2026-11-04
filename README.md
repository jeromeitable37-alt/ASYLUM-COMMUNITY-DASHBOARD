# Asylum Community Official Dashboard

Migrated React/Vite dashboard with **Neon PostgreSQL** for dashboard records, **Vercel Functions** for all database access, and the existing **Supabase Auth and Storage** (to preserve current users and photo URLs). The Recruitment site stays separate.

## Official ASYLUM network

This is the **main link** for ASYLUM COMMUNITY:

- Main portal and verified members: https://asylum-community-dashboard.vercel.app/
- Direct / Referral Recruitment: https://asylum-community-recruitment-sigma.vercel.app/
- Official Jersey Drop: https://asylum-jersey-nu.vercel.app/

These remain **three separate sites**, connected with navigation links. This dashboard has its own Neon PostgreSQL tables; the Recruitment site and Jersey order flow are not moved or modified by the database upgrade.

## Streamer Mode ID

- New registrants can optionally submit their Streamer Mode ID (SMode ID) at signup.
- The public official member directory supports searching by IGN, UID, Streamer Mode ID, or team.
- Authorized management and moderators can complete or correct the SMode ID of existing approved members using the **Add / Edit Streamer ID** control on the member card.
- Updates go through authenticated `/api/dashboard?action=set_streamer_id` and are saved in Neon `members`, with the associated `member_applications` record updated as well.
- Missing values are displayed as `Not provided`; entering an empty value removes the optional ID.
- Run the idempotent additions in `schema.sql` when setting up a new Neon environment.

## Cyber UI and owner account center

- **Leadership profiles:** responsive medium-size staff cards with photo, display name, **IGN**, role and introduction. The public API joins verified member/application information and never exposes staff email addresses.
- **Owner → User Management:** browsable accounts, filtered by IGN, name, email, current role or portal status. Select **Member**, **Moderator**, **Admin** or **Management Admin** from an account card; press **Save**. The Owner cannot demote or remove themselves here.
- **Disable / Remove / Restore:** these are **portal-only** status changes in Neon. Disabled or removed users cannot access authenticated official dashboard APIs and are hidden from its public directory; historical rows remain intact for recovery. This does not globally deactivate their **Supabase Auth** account, and **does not disable Recruitment** because that website shares the same Supabase Auth project.
- **Audit trail:** role and portal-status changes record actor, target, action and timestamp in `portal_account_audit`.
- **About ASYLUM:** editable founder, founding date, origin, headline, description and mission via the **Edit About ASYLUM** action. Default founder and date are explicitly unconfirmed, not invented.
- **Login:** glassmorphism, floating labels, show/hide password toggle, subtle CSS animated gradients, interactive accent styling, keyboard focus support and reduced-motion fallbacks. No heavy Three.js assets needed.
- **Admin permissions:** user-role and status operations are restricted to the current Owner; website showcase content is still editable by authorized management staff.

Database migrations are versioned in `schema.sql`. Never paste Neon connection secrets or Supabase service-role credentials into GitHub.

## Deployment

1. Import this repository into Vercel as a **Vite** project. Build command: `npm run build`. Output: `dist`.
2. Add **all** variables from `.env.example` in Vercel → Settings → Environment Variables, with real values. Keep `DATABASE_URL` server-only. For this Neon project use the pooled connection URI from Neon console.
3. Ensure Neon has the `schema.sql` tables. The first admin should sign in with the email configured as `OWNER_EMAIL` in Vercel. Set this only to your authorized owner account. The app will create the first owner record if there is not already an owner.
4. Deploy; test the public directory, sign in, signup, photo upload, admin review, role assignment, and ownership transfer.

## Important migration note

The exported frontend ZIP does **not** contain Supabase database rows. This repository does not automatically transfer historical member and application records from Supabase. See `MIGRATION.md` to plan a controlled migration before production cutover. Do **not** delete the existing Supabase database, authentication, or storage; the recruitment application may use the same project.

## Local development

Run `npm install` then `npx vercel dev` (after linking your Vercel project and using local environment variables). `npm run dev` alone starts only the Vite frontend, not `/api/dashboard`.

## Security

- Only the backend has a `DATABASE_URL`. Never commit secrets.
- Supabase Auth verifies every privileged API request using `auth.getUser(access_token)`.
- Server verifies role from Neon on every admin action.
- Do not place raw user data, member emails, or database backups in this public GitHub repository.
- The `community-photos` bucket must have appropriately scoped upload policies in Supabase Storage.

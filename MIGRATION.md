# Supabase → Neon record migration

This is a **partial infrastructure migration**: dashboard database moves to Neon; existing login and photo storage stay at Supabase to preserve identities and images without resetting passwords. The Supabase project is shared with recruitment: **do not change its schema or delete it**.

Tables from original `Asy fam` public schema needed by dashboard:
- `members` (including `user_id`)
- `member_applications` (ID is the Supabase Auth user UUID)
- `community_admins` (user_id is the Supabase Auth user UUID)

These are represented in `schema.sql` with compatible columns but without FK constraints to the original Supabase `auth.users`. The `identities` table is populated at first login, to support owner administration by email.

## Historical data

**Not yet migrated.** Export these three tables privately (CSV or SQL data export), then import into Neon using the appropriate columns. Only use a trusted SQL connection; don't commit the records or passwords to GitHub. Verify row counts and record ownership, then audit review and role permissions. Because users still authenticate via Supabase, their original UUIDs must remain intact.

## Initial owner

Set `OWNER_EMAIL` in Vercel only, using the authorized owner account's email. If Neon has no existing owner, that account may establish the initial owner role after sign-in. Avoid reassigning an existing owner and review the role table before production launch.

## Before switching the public website

- Verify all historical application approvals and photo links.
- Confirm that registration creates the Neon application record.
- Confirm management can review and that only authorized roles can change member records.
- Verify that the same account can log in, and the recruitment website remains unaffected.
- Take a database backup and arrange a short write freeze to avoid diverging data between the original Supabase DB and Neon during migration.

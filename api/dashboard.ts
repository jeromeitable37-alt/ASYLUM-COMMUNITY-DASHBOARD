import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isImageUrl = (v: unknown) => typeof v === 'string' && v.length < 2048 && /^https:\/\//i.test(v);
const safeName = (v: unknown, len = 60) => typeof v === 'string' ? v.trim().slice(0, len) : '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Public readiness check; never return credentials or any member data.
  if (req.method === 'GET' && req.query.action === 'health') {
    const configured = Boolean(process.env.DATABASE_URL && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
    if (!configured) return res.status(503).json({ ok: false, status: 'missing_configuration', checks: { databaseUrl: Boolean(process.env.DATABASE_URL), supabaseUrl: Boolean(process.env.SUPABASE_URL), supabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY), ownerEmail: Boolean(process.env.OWNER_EMAIL) } });
    try {
      const check = await neon(process.env.DATABASE_URL!)`SELECT 1 AS connected`;
      return res.status(200).json({ ok: check.length === 1, status: 'ready' });
    } catch {
      return res.status(503).json({ ok: false, status: 'database_connection_failed' });
    }
  }
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error: 'Database or authentication environment is not configured.' });
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const sql = neon(process.env.DATABASE_URL);
  const action = String(req.query.action || '');
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (req.method === 'GET' && action === 'directory') {
      const rows = await sql`SELECT m.id,m.display_name,m.ign,m.uid,m.streamer_mode_id,m.team,m.role,m.photo_url FROM members m LEFT JOIN identities i ON i.user_id=m.user_id WHERE COALESCE(i.portal_status,'active')='active' ORDER BY m.created_at DESC LIMIT 3000`;
      return res.json({ data: rows });
    }
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return res.status(401).json({ error: 'Sign in is required.' });
    const { data: { user }, error } = await supa.auth.getUser(bearer);
    if (error || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    const userId = user.id;
    const portal = await sql`SELECT portal_status FROM identities WHERE user_id=${userId}::uuid LIMIT 1`;
    if (portal.length && portal[0].portal_status !== 'active')
      return res.status(403).json({ error: portal[0].portal_status === 'disabled' ? 'Your Asylum Community portal access is disabled. Contact management.' : 'This account was removed from the official portal. Contact management to restore it.' });
    const roles = await sql`SELECT role FROM community_admins WHERE user_id = ${userId}::uuid LIMIT 1`;
    const role = roles[0]?.role as string | undefined;
    const manager = role === 'owner' || role === 'management' || role === 'admin' || role === 'moderator';
    const owner = role === 'owner';
    if (req.method === 'POST' && action === 'bootstrap') {
      const displayName = safeName(user.user_metadata?.display_name);
      const ign = safeName(user.user_metadata?.ign, 40);
      const uid = safeName(user.user_metadata?.uid, 40);
      const streamerId = safeName(user.user_metadata?.streamer_mode_id, 100) || null;
      if (user.email) await sql`INSERT INTO identities (user_id,email) VALUES (${userId}::uuid,${user.email}) ON CONFLICT (user_id) DO UPDATE SET email = excluded.email`;
      if (user.email && process.env.OWNER_EMAIL && user.email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase()) {
        await sql`INSERT INTO community_admins (user_id,role) SELECT ${userId}::uuid,'owner' WHERE NOT EXISTS (SELECT 1 FROM community_admins WHERE role='owner') ON CONFLICT (user_id) DO NOTHING`;
      }
      // For new registrations, a real Streamer Mode ID must have been submitted.
      // Existing legacy profiles without an ID remain accessible so users can complete them.
      if (displayName.length >= 2 && ign.length >= 2 && uid.length >= 3 && streamerId) {
        await sql`INSERT INTO member_applications (id,display_name,ign,uid,streamer_mode_id)
          VALUES (${userId}::uuid,${displayName},${ign},${uid},${streamerId})
          ON CONFLICT (id) DO UPDATE SET streamer_mode_id=EXCLUDED.streamer_mode_id,updated_at=now()
          WHERE member_applications.streamer_mode_id IS NULL OR trim(member_applications.streamer_mode_id)=''`;
        // Restore missing IDs on previously approved profiles, without changing staff-reviewed values.
        await sql`UPDATE members SET streamer_mode_id=${streamerId},updated_at=now()
          WHERE user_id=${userId}::uuid AND (streamer_mode_id IS NULL OR trim(streamer_mode_id)='')`;
      }
      return res.json({ data: { created: true, needs_streamer_mode_id: !streamerId } });
    }
    if (req.method === 'POST' && action === 'set_my_streamer_id') {
      const raw = payload.streamer_mode_id;
      if (typeof raw !== 'string' || raw.trim().length < 1 || raw.trim().length > 100)
        return res.status(400).json({ error: 'Streamer Mode ID is required (maximum 100 characters).' });
      const id = raw.trim();
      const existing = await sql`SELECT id FROM member_applications WHERE id=${userId}::uuid LIMIT 1`;
      let rows;
      if (existing.length) {
        rows = await sql`WITH application_updated AS (
          UPDATE member_applications SET streamer_mode_id=${id},updated_at=now()
          WHERE id=${userId}::uuid RETURNING *
        ), member_updated AS (
          UPDATE members SET streamer_mode_id=${id},updated_at=now()
          WHERE user_id=${userId}::uuid RETURNING id
        ) SELECT * FROM application_updated`;
      } else {
        const displayName = safeName(user.user_metadata?.display_name);
        const ign = safeName(user.user_metadata?.ign,40);
        const uid = safeName(user.user_metadata?.uid,40);
        if (displayName.length < 2 || ign.length < 2 || uid.length < 3)
          return res.status(422).json({ error: 'Your previous signup is missing IGN or UID. Please contact management to complete your member profile.' });
        rows = await sql`WITH application_inserted AS (
          INSERT INTO member_applications(id,display_name,ign,uid,streamer_mode_id)
          VALUES (${userId}::uuid,${displayName},${ign},${uid},${id})
          ON CONFLICT(id) DO UPDATE SET streamer_mode_id=EXCLUDED.streamer_mode_id,updated_at=now()
          RETURNING *
        ), member_updated AS (
          UPDATE members SET streamer_mode_id=${id},updated_at=now()
          WHERE user_id=${userId}::uuid RETURNING id
        ) SELECT * FROM application_inserted`;
      }
      if (!rows.length) return res.status(404).json({ error: 'Unable to save the Streamer Mode ID.' });
      return res.json({ data: rows[0] });
    }
    if (req.method === 'GET' && action === 'profile') {
      const [app, admin] = await Promise.all([
        sql`SELECT * FROM member_applications WHERE id = ${userId}::uuid LIMIT 1`,
        sql`SELECT user_id, role, photo_url FROM community_admins WHERE user_id = ${userId}::uuid LIMIT 1`,
      ]);
      return res.json({ data: { application: app[0] || null, admin: admin[0] || null } });
    }
    if (req.method === 'GET' && action === 'queue') {
      if (!manager) return res.status(403).json({ error: 'Management access required.' });
      const [applications, members] = await Promise.all([
        sql`SELECT * FROM member_applications ORDER BY created_at DESC LIMIT 2000`,
        sql`SELECT m.id,m.user_id,m.display_name,m.ign,m.uid,m.streamer_mode_id,m.team,m.role,m.photo_url FROM members m LEFT JOIN identities i ON i.user_id=m.user_id WHERE COALESCE(i.portal_status,'active')='active' ORDER BY m.created_at DESC LIMIT 3000`,
      ]);
      return res.json({ data: { applications, members } });
    }
    if (req.method === 'GET' && action === 'admins') {
      if (!owner) return res.status(403).json({ error: 'Owner access required.' });
      const rows = await sql`SELECT a.user_id,i.email,a.role,a.created_at,a.photo_url FROM community_admins a LEFT JOIN identities i ON i.user_id=a.user_id ORDER BY a.created_at`;
      return res.json({ data: rows });
    }
    if (req.method === 'GET' && action === 'users') {
      if (!owner) return res.status(403).json({ error: 'Owner access required.' });
      const rows = await sql`
        SELECT i.user_id,i.email,i.portal_status,i.created_at,
               COALESCE(NULLIF(m.display_name,''),NULLIF(ap.display_name,''),'Community account') AS display_name,
               COALESCE(NULLIF(m.ign,''),NULLIF(ap.ign,'')) AS ign,
               COALESCE(m.photo_url,ap.photo_url) AS photo_url,
               COALESCE(a.role,'member') AS role,
               ap.status AS application_status,
               (m.id IS NOT NULL) AS has_member_profile,
               (ap.id IS NOT NULL) AS has_application
        FROM identities i
        LEFT JOIN members m ON m.user_id=i.user_id
        LEFT JOIN member_applications ap ON ap.id=i.user_id
        LEFT JOIN community_admins a ON a.user_id=i.user_id
        ORDER BY CASE WHEN a.role='owner' THEN 0 ELSE 1 END,i.created_at DESC
        LIMIT 500
      `;
      return res.json({ data: rows });
    }
    if (req.method === 'POST' && action === 'user_role') {
      if (!owner) return res.status(403).json({ error: 'Owner access required.' });
      if (!isUuid(payload.user_id) || payload.user_id === userId)
        return res.status(400).json({error:'Choose a registered account other than the current Owner.'});
      const newRole = String(payload.role || '');
      if (!['member','management','admin','moderator'].includes(newRole))
        return res.status(400).json({error:'Choose a valid dashboard role.'});
      const changed = await sql`SELECT user_id,role FROM public.portal_change_role(
        ${userId}::uuid,${payload.user_id}::uuid,${newRole}
      )`;
      if (!changed.length) return res.status(409).json({error:'Role update was not applied. Refresh and retry.'});
      return res.json({data:changed[0]});
    }
    if (req.method === 'POST' && action === 'user_status') {
      if (!owner) return res.status(403).json({error:'Owner access required.'});
      if (!isUuid(payload.user_id) || payload.user_id === userId)
        return res.status(400).json({error:'The Owner account cannot be archived or disabled.'});
      const newStatus = String(payload.portal_status || '');
      if (!['active','disabled','removed'].includes(newStatus))
        return res.status(400).json({error:'Choose a valid account status.'});
      const changed = await sql`SELECT user_id,portal_status FROM public.portal_change_status(
        ${userId}::uuid,${payload.user_id}::uuid,${newStatus}
      )`;
      if (!changed.length) return res.status(409).json({error:'Status was not changed. Refresh the users list.'});
      return res.json({data:changed[0]});
    }
    if (req.method === 'POST' && action === 'set_streamer_id') {
      if (!manager) return res.status(403).json({ error: 'Management access required.' });
      if (!isUuid(payload.member_id)) return res.status(400).json({ error: 'Invalid member.' });
      if (typeof payload.streamer_mode_id !== 'string' || !payload.streamer_mode_id.trim() || payload.streamer_mode_id.trim().length > 100)
        return res.status(400).json({ error: 'Streamer Mode ID is required (maximum 100 characters).' });
      const streamerId = payload.streamer_mode_id.trim();
      // Keep roster and the linked application consistent in one Postgres statement.
      const rows = await sql`WITH updated_member AS (
        UPDATE members SET streamer_mode_id=${streamerId}, updated_at=now()
        WHERE id=${payload.member_id}::uuid RETURNING id,user_id,streamer_mode_id
      ), updated_application AS (
        UPDATE member_applications SET streamer_mode_id=${streamerId},updated_at=now()
        WHERE id IN (SELECT user_id FROM updated_member WHERE user_id IS NOT NULL) RETURNING id
      ) SELECT id,streamer_mode_id FROM updated_member`;
      if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
      return res.json({ data: rows[0] });
    }
    if (req.method === 'POST' && action === 'photo') {
      if (!isImageUrl(payload.photo_url)) return res.status(400).json({ error: 'Invalid photo URL.' });
      const photoUrl = payload.photo_url as string;
      const photoType = String(payload.kind || 'application');
      if (photoType === 'application') {
        const rows = await sql`UPDATE member_applications SET photo_url=${photoUrl},updated_at=now() WHERE id=${userId}::uuid AND status='pending' RETURNING id`;
        if (!rows.length) return res.status(409).json({ error: 'No pending application found.' });
      } else if (photoType === 'self') {
        await sql`UPDATE member_applications SET photo_url=${photoUrl},updated_at=now() WHERE id=${userId}::uuid`;
        await sql`UPDATE members SET photo_url=${photoUrl},updated_at=now() WHERE user_id=${userId}::uuid`;
      } else if (photoType === 'admin') {
        if (!role) return res.status(403).json({ error: 'Not an admin.' });
        await sql`UPDATE community_admins SET photo_url=${photoUrl} WHERE user_id=${userId}::uuid`;
      } else if (photoType === 'member') {
        if (!manager || !isUuid(payload.member_id)) return res.status(403).json({ error: 'Management access required.' });
        const rows = await sql`UPDATE members SET photo_url=${photoUrl},updated_at=now() WHERE id=${payload.member_id}::uuid RETURNING id`;
        if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
      } else return res.status(400).json({ error: 'Invalid photo type.' });
      return res.json({ data: { saved: true } });
    }
    if (req.method === 'POST' && action === 'review') {
      if (!manager) return res.status(403).json({ error: 'Management access required.' });
      if (!isUuid(payload.id) || !['approved','rejected'].includes(payload.status)) return res.status(400).json({ error: 'Invalid application or decision.' });
      const decision = payload.status as 'approved' | 'rejected';
      // CTE keeps the approval and roster insertion in one PostgreSQL statement.
      let updated;
      if (decision === 'approved') {
        updated = await sql`WITH decision AS (
          UPDATE member_applications SET status='approved',reviewed_by=${userId}::uuid,
            review_note='Approved by management',updated_at=now()
          WHERE id=${payload.id}::uuid AND status='pending' RETURNING *
        ), registered AS (
          INSERT INTO members (user_id,display_name,ign,uid,streamer_mode_id,photo_url)
          SELECT id,display_name,ign,uid,streamer_mode_id,photo_url FROM decision
          ON CONFLICT (user_id) DO UPDATE SET display_name=excluded.display_name,
             ign=excluded.ign,uid=excluded.uid,
             streamer_mode_id=COALESCE(excluded.streamer_mode_id,members.streamer_mode_id),
             photo_url=excluded.photo_url,updated_at=now()
          RETURNING id
        ) SELECT decision.* FROM decision JOIN registered ON registered.id IS NOT NULL`;
      } else {
        updated = await sql`UPDATE member_applications SET status='rejected',reviewed_by=${userId}::uuid,
          review_note='Not approved by management',updated_at=now()
          WHERE id=${payload.id}::uuid AND status='pending' RETURNING *`;
      }
      if (!updated.length) return res.status(409).json({ error: 'Application was already reviewed or not found.' });
      return res.json({ data: updated[0] });
    }
    if (req.method === 'POST' && action === 'remove_member') {
      if (!manager || !isUuid(payload.member_id)) return res.status(403).json({ error: 'Management access required.' });
      const rows = await sql`DELETE FROM members WHERE id=${payload.member_id}::uuid RETURNING id`;
      return res.json({ data: rows[0] || null });
    }
    if (req.method === 'POST' && action === 'set_role') {
      if (!owner) return res.status(403).json({ error: 'Owner access required.' });
      const email = safeName(payload.email, 254).toLowerCase();
      const newRole = String(payload.role);
      if (!['management','moderator','remove'].includes(newRole)) return res.status(400).json({ error: 'Invalid role.' });
      const target = await sql`SELECT user_id FROM identities WHERE lower(email)=${email} LIMIT 1`;
      if (!target.length) return res.status(404).json({ error: 'User needs to sign in once before being assigned a role.' });
      if (target[0].user_id === userId) return res.status(400).json({ error: 'Cannot change your own owner role here.' });
      if (newRole === 'remove') {
        await sql`DELETE FROM community_admins WHERE user_id=${target[0].user_id}::uuid AND role<>'owner'`;
      } else {
        await sql`INSERT INTO community_admins (user_id,role) VALUES (${target[0].user_id}::uuid,${newRole}) ON CONFLICT (user_id) DO UPDATE SET role=excluded.role WHERE community_admins.role <> 'owner'`;
      }
      return res.json({ data: { saved: true } });
    }
    if (req.method === 'POST' && action === 'transfer') {
      if (!owner) return res.status(403).json({ error: 'Owner access required.' });
      const email = safeName(payload.email, 254).toLowerCase();
      const target = await sql`SELECT user_id,portal_status FROM identities WHERE lower(email)=${email} LIMIT 1`;
      if (!target.length) return res.status(404).json({ error: 'Target account must sign in first.' });
      if (target[0].portal_status !== 'active') return res.status(409).json({ error: 'Restore the target account before transferring ownership.' });
      if (target[0].user_id === userId) return res.status(400).json({ error: 'Already the owner.' });
      // Atomic transaction in one statement to maintain a single owner.
      const updates = await sql`WITH downgrade AS (UPDATE community_admins SET role='management' WHERE user_id=${userId}::uuid AND role='owner' RETURNING user_id), upgrade AS (INSERT INTO community_admins (user_id,role) SELECT ${target[0].user_id}::uuid,'owner' FROM downgrade ON CONFLICT (user_id) DO UPDATE SET role='owner' RETURNING user_id) SELECT (SELECT count(*) FROM upgrade)::int AS changed`;
      if (!updates[0]?.changed) return res.status(409).json({ error: 'Ownership update failed.' });
      return res.json({ data: { transferred: true } });
    }
    return res.status(404).json({ error: 'Unknown API operation.' });
  } catch (err) {
    console.error('Dashboard API error', err);
    const message = err instanceof Error ? err.message : '';
    // These phrases are deliberately authored in the isolated Neon procedures.
    // Return only known safe errors, never internal SQL/connection diagnostics.
    const safePortalMessages = [
      'Only the active Owner can change roles.',
      'Only the active Owner can update account access.',
      'The Owner account is protected.',
      'Owner role is protected.',
      'Owner account cannot be archived or disabled.',
      'Invalid dashboard role.',
      'Invalid account status.',
      'Registered dashboard account not found.',
      'Restore the inactive account before changing roles.',
    ];
    if (['user_role','user_status'].includes(action)) {
      const safeMessage = safePortalMessages.find(item => message.includes(item));
      if (safeMessage) return res.status(409).json({error:safeMessage});
    }
    return res.status(500).json({ error: 'Dashboard database request failed. No change was confirmed. Refresh and retry, or contact the Owner.' });
  }
}

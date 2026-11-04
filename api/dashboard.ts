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
      if (displayName.length >= 2 && ign.length >= 2 && uid.length >= 3) {
        await sql`INSERT INTO member_applications (id,display_name,ign,uid,streamer_mode_id) VALUES (${userId}::uuid,${displayName},${ign},${uid},${streamerId}) ON CONFLICT (id) DO NOTHING`;
      }
      return res.json({ data: { created: true } });
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
      if (!isUuid(payload.user_id) || payload.user_id===userId) return res.status(400).json({error:'Invalid target account.'});
      const newRole = String(payload.role || '');
      if (!['member','management','admin','moderator'].includes(newRole)) return res.status(400).json({error:'Choose a valid role.'});
      const target = await sql`SELECT i.user_id,i.portal_status,a.role AS existing_role FROM identities i LEFT JOIN community_admins a ON a.user_id=i.user_id WHERE i.user_id=${payload.user_id}::uuid LIMIT 1`;
      if (!target.length) return res.status(404).json({error:'Registered account not found.'});
      if (target[0].existing_role==='owner') return res.status(403).json({error:'Owner role cannot be changed here.'});
      if (target[0].portal_status!=='active') return res.status(409).json({error:'Restore this account before changing its role.'});
      if (newRole==='member') {
        await sql.transaction([
          sql`DELETE FROM community_admins WHERE user_id=${payload.user_id}::uuid AND role<>'owner'`,
          sql`INSERT INTO portal_account_audit(actor_user_id,target_user_id,action,details) VALUES (${userId}::uuid,${payload.user_id}::uuid,'role_change',jsonb_build_object('from',${String(target[0].existing_role||'member')},'to',${newRole}))`
        ]);
      } else {
        await sql.transaction([
          sql`INSERT INTO community_admins(user_id,role) VALUES (${payload.user_id}::uuid,${newRole}) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role WHERE community_admins.role<>'owner'`,
          sql`INSERT INTO portal_account_audit(actor_user_id,target_user_id,action,details) VALUES (${userId}::uuid,${payload.user_id}::uuid,'role_change',jsonb_build_object('from',${String(target[0].existing_role||'member')},'to',${newRole}))`
        ]);
      }
      return res.json({data:{user_id:payload.user_id,role:newRole}});
    }
    if (req.method === 'POST' && action === 'user_status') {
      if (!owner) return res.status(403).json({error:'Owner access required.'});
      if (!isUuid(payload.user_id) || payload.user_id===userId) return res.status(400).json({error:'Cannot change your own owner account.'});
      const nextStatus = String(payload.portal_status || '');
      if (!['active','disabled','removed'].includes(nextStatus)) return res.status(400).json({error:'Invalid account status.'});
      const existing = await sql`SELECT i.portal_status,a.role FROM identities i LEFT JOIN community_admins a ON a.user_id=i.user_id WHERE i.user_id=${payload.user_id}::uuid LIMIT 1`;
      if (!existing.length) return res.status(404).json({error:'Account not found.'});
      if (existing[0].role==='owner') return res.status(403).json({error:'Owner account is protected.'});
      // One atomic SQL statement: update and audit must always succeed or fail together.
      const changed = await sql`
        WITH updated AS (
          UPDATE identities
          SET portal_status=${nextStatus},portal_status_updated_at=now()
          WHERE user_id=${payload.user_id}::uuid AND portal_status=${String(existing[0].portal_status)}
          RETURNING user_id,portal_status
        ), audited AS (
          INSERT INTO portal_account_audit(actor_user_id,target_user_id,action,details)
          SELECT ${userId}::uuid,u.user_id,'portal_status_change',
                 jsonb_build_object('from',${String(existing[0].portal_status)},'to',u.portal_status)
          FROM updated u
          RETURNING id
        )
        SELECT u.user_id,u.portal_status FROM updated u WHERE EXISTS(SELECT 1 FROM audited)
      `;
      if (!changed.length) return res.status(409).json({error:'Account status changed while you were editing. Refresh the list and try again.'});
      return res.json({data:changed[0]});
    }
    if (req.method === 'POST' && action === 'set_streamer_id') {
      if (!manager) return res.status(403).json({ error: 'Management access required.' });
      if (!isUuid(payload.member_id)) return res.status(400).json({ error: 'Invalid member.' });
      if (typeof payload.streamer_mode_id !== 'string' || payload.streamer_mode_id.length > 100)
        return res.status(400).json({ error: 'Streamer Mode ID must be 100 characters or fewer.' });
      const streamerId = payload.streamer_mode_id.trim() || null;
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
    return res.status(500).json({ error: 'Unable to complete request. Please retry or contact management.' });
  }
}

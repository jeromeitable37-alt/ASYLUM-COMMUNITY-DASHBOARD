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
      const rows = await sql`SELECT id,display_name,ign,uid,team,role,photo_url FROM members ORDER BY created_at DESC LIMIT 3000`;
      return res.json({ data: rows });
    }
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return res.status(401).json({ error: 'Sign in is required.' });
    const { data: { user }, error } = await supa.auth.getUser(bearer);
    if (error || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    const userId = user.id;
    const roles = await sql`SELECT role FROM community_admins WHERE user_id = ${userId}::uuid LIMIT 1`;
    const role = roles[0]?.role as string | undefined;
    const manager = role === 'owner' || role === 'management' || role === 'admin' || role === 'moderator';
    const owner = role === 'owner';
    if (req.method === 'POST' && action === 'bootstrap') {
      const displayName = safeName(user.user_metadata?.display_name);
      const ign = safeName(user.user_metadata?.ign, 40);
      const uid = safeName(user.user_metadata?.uid, 40);
      if (user.email) await sql`INSERT INTO identities (user_id,email) VALUES (${userId}::uuid,${user.email}) ON CONFLICT (user_id) DO UPDATE SET email = excluded.email`;
      if (user.email && process.env.OWNER_EMAIL && user.email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase()) {
        await sql`INSERT INTO community_admins (user_id,role) SELECT ${userId}::uuid,'owner' WHERE NOT EXISTS (SELECT 1 FROM community_admins WHERE role='owner') ON CONFLICT (user_id) DO NOTHING`;
      }
      if (displayName.length >= 2 && ign.length >= 2 && uid.length >= 3) {
        await sql`INSERT INTO member_applications (id,display_name,ign,uid) VALUES (${userId}::uuid,${displayName},${ign},${uid}) ON CONFLICT (id) DO NOTHING`;
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
        sql`SELECT id,display_name,ign,uid,team,role,photo_url FROM members ORDER BY created_at DESC LIMIT 3000`,
      ]);
      return res.json({ data: { applications, members } });
    }
    if (req.method === 'GET' && action === 'admins') {
      if (!owner) return res.status(403).json({ error: 'Owner access required.' });
      const rows = await sql`SELECT a.user_id,i.email,a.role,a.created_at,a.photo_url FROM community_admins a LEFT JOIN identities i ON i.user_id=a.user_id ORDER BY a.created_at`;
      return res.json({ data: rows });
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
          INSERT INTO members (user_id,display_name,ign,uid,photo_url)
          SELECT id,display_name,ign,uid,photo_url FROM decision
          ON CONFLICT (user_id) DO UPDATE SET display_name=excluded.display_name,
             ign=excluded.ign,uid=excluded.uid,photo_url=excluded.photo_url,updated_at=now()
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
      const target = await sql`SELECT user_id FROM identities WHERE lower(email)=${email} LIMIT 1`;
      if (!target.length) return res.status(404).json({ error: 'Target account must sign in first.' });
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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requirePortalIdentity, PortalAuthError } from './lib/neon-identity.js';
import { neon } from '@neondatabase/serverless';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isImageUrl = (v: unknown) => typeof v === 'string' && v.length < 2048 && /^https:\/\//i.test(v);
const safeName = (v: unknown, len = 60) => typeof v === 'string' ? v.trim().slice(0, len) : '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Public readiness check; never return credentials or any member data.
  if (req.method === 'GET' && req.query.action === 'health') {
    const configured = Boolean(process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_JWKS_URL && process.env.NEON_AUTH_CUTOVER_ENABLED === 'true');
    if (!configured) return res.status(503).json({ ok: false, status: 'missing_configuration', checks: { databaseUrl: Boolean(process.env.DATABASE_URL), neonAuthUrl: Boolean(process.env.NEON_AUTH_BASE_URL), neonJwks: Boolean(process.env.NEON_AUTH_JWKS_URL), cutoverEnabled: process.env.NEON_AUTH_CUTOVER_ENABLED === 'true' } });
    try {
      const check = await neon(process.env.DATABASE_URL!)`SELECT 1 AS connected`;
      return res.status(200).json({ ok: check.length === 1, status: 'ready' });
    } catch {
      return res.status(503).json({ ok: false, status: 'database_connection_failed' });
    }
  }
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Neon database is not configured.' });
  const sql = neon(process.env.DATABASE_URL);
  const action = String(req.query.action || '');
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (req.method === 'GET' && action === 'directory') {
      const rows = await sql`SELECT m.id,m.display_name,m.ign,m.uid,m.streamer_mode_id,m.team,m.role,m.photo_url FROM members m LEFT JOIN identities i ON i.user_id=m.user_id WHERE COALESCE(i.portal_status,'active')='active' ORDER BY m.created_at DESC LIMIT 3000`;
      return res.json({ data: rows });
    }
    const user = await requirePortalIdentity(req,sql);
    const userId = user.id;
    const portal = await sql`SELECT portal_status FROM identities WHERE user_id=${userId}::uuid LIMIT 1`;
    if (portal.length && portal[0].portal_status !== 'active')
      return res.status(403).json({ error: portal[0].portal_status === 'disabled' ? 'Your Asylum Community portal access is disabled. Contact management.' : 'This account was removed from the official portal. Contact management to restore it.' });
    const roles = await sql`SELECT role FROM community_admins WHERE user_id = ${userId}::uuid LIMIT 1`;
    const role = roles[0]?.role as string | undefined;
    const manager = role === 'owner' || role === 'management' || role === 'admin' || role === 'moderator';
    const owner = role === 'owner';
    if (req.method === 'POST' && action === 'bootstrap') {
      const displayName = safeName(payload.display_name || user.user_metadata.display_name);
      const ign = safeName(payload.ign,40);
      const uid = safeName(payload.uid,40);
      const streamerId = safeName(payload.streamer_mode_id,100);
      // The user is already bound to a verified Neon Auth email and dashboard UUID.
      // Never overwrite an approved application's reviewed IGN, UID, or status.
      const existing = await sql`SELECT id,streamer_mode_id FROM member_applications WHERE id=${userId}::uuid LIMIT 1`;
      if (!existing.length) {
        if (displayName.length < 2 || ign.length < 2 || uid.length < 3 || !streamerId)
          return res.status(422).json({error:'Complete your full name, IGN, UID, and required Streamer Mode ID to submit your application.'});
        await sql`INSERT INTO member_applications(id,display_name,ign,uid,streamer_mode_id)
          VALUES (${userId}::uuid,${displayName},${ign},${uid},${streamerId})
          ON CONFLICT(id) DO NOTHING`;
      } else if (streamerId && !existing[0].streamer_mode_id) {
        await sql`UPDATE member_applications SET streamer_mode_id=${streamerId},updated_at=now()
          WHERE id=${userId}::uuid AND (streamer_mode_id IS NULL OR trim(streamer_mode_id)='')`;
        await sql`UPDATE members SET streamer_mode_id=${streamerId},updated_at=now()
          WHERE user_id=${userId}::uuid AND (streamer_mode_id IS NULL OR trim(streamer_mode_id)='')`;
      }
      return res.json({data:{created:true}});
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
        const displayName = safeName(payload.display_name || user.user_metadata.display_name);
        const ign = safeName(payload.ign,40);
        const uid = safeName(payload.uid,40);
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
      return res.json({ data: { dashboard_user_id: userId, application: app[0] || null, admin: admin[0] || null } });
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
               COALESCE(NULLIF(sp.display_name,''),NULLIF(m.display_name,''),NULLIF(ap.display_name,''),'Community account') AS display_name,
               COALESCE(NULLIF(sp.ign,''),NULLIF(m.ign,''),NULLIF(ap.ign,'')) AS ign,
               sp.display_name AS staff_display_name,sp.ign AS staff_ign,
               COALESCE(m.photo_url,ap.photo_url,sp.photo_url) AS photo_url,
               COALESCE(a.role,'member') AS role,
               ap.status AS application_status,
               (m.id IS NOT NULL) AS has_member_profile,
               (ap.id IS NOT NULL) AS has_application,
               (SELECT u.id::text FROM neon_auth."user" u WHERE lower(u.email)=lower(i.email) LIMIT 1) AS neon_auth_user_id,
               EXISTS(SELECT 1 FROM neon_auth."user" u WHERE lower(u.email)=lower(i.email)) AS has_neon_login,
               EXISTS(SELECT 1 FROM neon_auth."user" u WHERE lower(u.email)=lower(i.email) AND u."emailVerified"=true AND u.banned IS NOT TRUE) AS neon_verified,
               EXISTS(SELECT 1 FROM public.portal_auth_migration_links l WHERE l.dashboard_user_id=i.user_id) AS neon_linked
        FROM identities i
        LEFT JOIN members m ON m.user_id=i.user_id
        LEFT JOIN member_applications ap ON ap.id=i.user_id
        LEFT JOIN community_admins a ON a.user_id=i.user_id
        LEFT JOIN community_management_profiles sp ON sp.user_id=i.user_id
        ORDER BY CASE WHEN a.role='owner' THEN 0 ELSE 1 END,i.created_at DESC
        LIMIT 500
      `;
      return res.json({ data: rows });
    }
    if (req.method === 'POST' && action === 'staff_profile') {
      if (!owner) return res.status(403).json({error:'Owner access required.'});
      if (!isUuid(payload.user_id) || payload.user_id === userId)
        return res.status(400).json({error:'Choose an existing Management/Admin account other than Owner.'});
      if (typeof payload.display_name !== 'string' || typeof payload.ign !== 'string')
        return res.status(422).json({error:'Staff full name and IGN are required.'});
      const fullName = payload.display_name.trim();
      const staffIgn = payload.ign.trim();
      if (fullName.length < 2 || fullName.length > 80 || staffIgn.length < 2 || staffIgn.length > 40 ||
          /[\x00-\x1f\x7f]/.test(fullName + staffIgn))
        return res.status(422).json({error:'Use a full name of 2–80 characters and IGN of 2–40 characters.'});

      // Only the active non-Owner staff profile changes, not membership records.
      // New profiles are private; existing public-profile settings are preserved.
      const rows = await sql`WITH eligible AS (
          SELECT a.user_id FROM public.community_admins a
          JOIN public.identities i ON i.user_id=a.user_id
          WHERE a.user_id=${payload.user_id}::uuid
            AND a.role IN ('management','admin','moderator')
            AND i.portal_status='active'
        ), saved AS (
          INSERT INTO public.community_management_profiles (user_id,display_name,ign,show_public)
          SELECT user_id,${fullName},${staffIgn},false FROM eligible
          ON CONFLICT (user_id) DO UPDATE SET
            display_name=EXCLUDED.display_name,
            ign=EXCLUDED.ign,
            updated_at=now()
          RETURNING user_id::text AS user_id,display_name,ign
        ), audited AS (
          INSERT INTO public.portal_account_audit(actor_user_id,target_user_id,action,details)
          SELECT ${userId}::uuid,saved.user_id::uuid,'staff_profile_update',
            jsonb_build_object('fields',jsonb_build_array('display_name','ign'),
              'source','dashboard_owner_control')
          FROM saved RETURNING id
        )
        SELECT saved.user_id,saved.display_name,saved.ign FROM saved JOIN audited ON true`;
      if (rows.length !== 1)
        return res.status(409).json({error:'Only active Management/Admin profiles can be edited.'});
      return res.json({data:rows[0]});
    }
    if (req.method === 'POST' && action === 'link_staff_neon') {
      if (!owner) return res.status(403).json({error:'Owner access required.'});
      if (!isUuid(payload.user_id) || payload.user_id===userId)
        return res.status(400).json({error:'Choose another existing staff account.'});
      const staff=await sql`SELECT i.email,i.portal_status,a.role
        FROM public.identities i JOIN public.community_admins a ON a.user_id=i.user_id
        WHERE i.user_id=${payload.user_id}::uuid LIMIT 1`;
      if (staff.length!==1 || staff[0].portal_status!=='active' ||
          !['management','admin','moderator'].includes(String(staff[0].role)))
        return res.status(409).json({error:'Only active staff accounts can be linked.'});
      const verified=await sql`SELECT id::text AS subject FROM neon_auth."user"
        WHERE lower(email)=lower(${staff[0].email}) AND "emailVerified"=true
          AND banned IS NOT TRUE LIMIT 2`;
      if (verified.length!==1)
        return res.status(409).json({error:'This staff login must verify its existing email first.'});
      const subject=String(verified[0].subject);
      const existing=await sql`SELECT neon_subject,dashboard_user_id::text AS uid
        FROM public.portal_auth_migration_links
        WHERE neon_subject=${subject} OR dashboard_user_id=${payload.user_id}::uuid LIMIT 2`;
      if (existing.length) {
        if (existing.length===1 && existing[0].neon_subject===subject &&
            existing[0].uid===payload.user_id)
          return res.json({data:{linked:true,already_linked:true}});
        return res.status(409).json({error:'This verified login is already linked to another record.'});
      }
      const result=await sql`WITH inserted AS (
        INSERT INTO public.portal_auth_migration_links(neon_subject,dashboard_user_id,verified_email)
        SELECT u.id::text,i.user_id,lower(i.email)
        FROM public.identities i
        JOIN public.community_admins a ON a.user_id=i.user_id
        JOIN neon_auth."user" u ON lower(u.email)=lower(i.email)
        WHERE i.user_id=${payload.user_id}::uuid AND i.portal_status='active'
          AND a.role IN ('management','admin','moderator')
          AND u.id::text=${subject} AND u."emailVerified"=true
          AND u.banned IS NOT TRUE
        ON CONFLICT DO NOTHING
        RETURNING dashboard_user_id,neon_subject
      ), audit AS (
        INSERT INTO public.portal_auth_link_audit(actor_user_id,target_user_id,neon_subject)
        SELECT ${userId}::uuid,dashboard_user_id,neon_subject FROM inserted
        RETURNING id
      ) SELECT inserted.dashboard_user_id FROM inserted JOIN audit ON true`;
      if (result.length!==1)
        return res.status(409).json({error:'Neon did not save the account link. Refresh and retry.'});
      return res.json({data:{linked:true}});
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
    if (err instanceof PortalAuthError) return res.status(err.status).json({error:err.message});
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

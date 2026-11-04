import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { requirePortalIdentity, PortalAuthError } from './lib/neon-identity';

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const str = (v: unknown, max: number): string => typeof v === 'string' ? v.trim().slice(0, max) : '';
const optionalUrl = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid image URL.');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new Error('Images must use a valid https:// URL.'); }
};
const requireTitle = (v: unknown, max = 120): string => {
  const value = str(v, max);
  if (value.length < 2) throw new Error('Title or name must contain at least 2 characters.');
  return value;
};
const readId = (v: unknown): string | null => v === null || v === '' || v === undefined ? null : isUuid(v) ? v : (() => { throw new Error('Invalid record ID.'); })();
const errText = (error: unknown): string => error instanceof Error ? error.message : 'Unable to save the requested change.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Community database is not configured.' });
  const sql = neon(process.env.DATABASE_URL);
  const action = String(req.query.action || 'public');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (req.method === 'GET' && action === 'public') {
      const [teams, roster, achievements, gallery, management, aboutRows] = await Promise.all([
        sql`SELECT id,name,description,logo_url,captain_member_id,sort_order FROM community_teams ORDER BY sort_order,name LIMIT 100`,
        sql`SELECT tm.team_id,m.id,m.ign,m.display_name,m.photo_url,m.role
            FROM community_team_members tm JOIN members m ON m.id=tm.member_id
            LEFT JOIN identities i ON i.user_id=m.user_id
            WHERE COALESCE(i.portal_status,'active')='active'
            ORDER BY m.ign,m.display_name LIMIT 3000`,
        sql`SELECT id,title,subtitle,details,badge,image_url,achieved_on,sort_order
            FROM community_achievements ORDER BY sort_order,created_at DESC LIMIT 100`,
        sql`SELECT id,title,caption,category,image_url,sort_order,created_at
            FROM community_gallery ORDER BY sort_order,created_at DESC LIMIT 300`,
        sql`SELECT a.user_id,a.role,
              COALESCE(NULLIF(m.ign,''),NULLIF(ap.ign,'')) AS ign,
              COALESCE(NULLIF(p.display_name,''),NULLIF(m.display_name,''),initcap(a.role)||' Team') AS display_name,
              COALESCE(NULLIF(p.title,''),initcap(a.role)) AS title,
              COALESCE(p.bio,'') AS bio,
              COALESCE(NULLIF(p.photo_url,''),a.photo_url,m.photo_url) AS photo_url
            FROM community_admins a
            LEFT JOIN community_management_profiles p ON p.user_id=a.user_id
            LEFT JOIN members m ON m.user_id=a.user_id
            LEFT JOIN member_applications ap ON ap.id=a.user_id
            LEFT JOIN identities i ON i.user_id=a.user_id
            WHERE COALESCE(p.show_public,true)=true AND COALESCE(i.portal_status,'active')='active'
            ORDER BY CASE a.role WHEN 'owner' THEN 0 WHEN 'management' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,p.sort_order,a.created_at LIMIT 100`,
        sql`SELECT * FROM community_about WHERE id=1 LIMIT 1`,
      ]);
      return res.status(200).json({
        data: { teams: teams.map(team => ({
          ...team,
          members: roster.filter(member => member.team_id === team.id).map(member => ({
            id: member.id, ign: member.ign, display_name: member.display_name,
            photo_url: member.photo_url, role: member.role,
          })),
        })), achievements, gallery, management, about: aboutRows[0] || null },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not supported.' });
    const user = await requirePortalIdentity(req, sql);
    const staff = await sql`SELECT a.role,COALESCE(i.portal_status,'active') AS portal_status FROM community_admins a LEFT JOIN identities i ON i.user_id=a.user_id WHERE a.user_id=${user.id}::uuid LIMIT 1`;
    if (staff[0]?.portal_status && staff[0].portal_status !== 'active') return res.status(403).json({error:'Your dashboard account is disabled or removed.'});
    const role = String(staff[0]?.role || '');
    if (!['owner','management','admin','moderator'].includes(role))
      return res.status(403).json({ error: 'Management access is required.' });

    if (action === 'staff_list') {
      const rows = await sql`SELECT a.user_id,a.role,
          COALESCE(NULLIF(m.ign,''),NULLIF(ap.ign,'')) AS ign,
          COALESCE(NULLIF(p.display_name,''),NULLIF(m.display_name,''),initcap(a.role)||' Team') AS display_name,
          COALESCE(NULLIF(p.title,''),initcap(a.role)) AS title,
          COALESCE(p.bio,'') AS bio,
          COALESCE(NULLIF(p.photo_url,''),a.photo_url,m.photo_url) AS photo_url,
          COALESCE(p.show_public,true) AS show_public
        FROM community_admins a
        LEFT JOIN community_management_profiles p ON p.user_id=a.user_id
        LEFT JOIN members m ON m.user_id=a.user_id
        LEFT JOIN member_applications ap ON ap.id=a.user_id
        LEFT JOIN identities i ON i.user_id=a.user_id
        WHERE COALESCE(i.portal_status,'active')='active'
        ORDER BY CASE a.role WHEN 'owner' THEN 0 WHEN 'management' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,a.created_at LIMIT 100`;
      return res.json({ data: rows });
    }
    if (action === 'about_save') {
      const headline = requireTitle(body.headline,120);
      const description = str(body.description,1000);
      const mission = str(body.mission,500);
      const founder = str(body.founder,120) || 'To be announced';
      const origin = str(body.origin,160);
      const foundedOn = body.founded_on ? String(body.founded_on) : null;
      if (foundedOn && !/^\d{4}-\d{2}-\d{2}$/.test(foundedOn))
        return res.status(400).json({error:'Please provide a valid founding date.'});
      const rows = await sql`INSERT INTO community_about(id,headline,description,mission,founder,origin,founded_on,updated_at)
        VALUES(1,${headline},${description},${mission},${founder},${origin},${foundedOn}::date,now())
        ON CONFLICT(id) DO UPDATE SET headline=EXCLUDED.headline,description=EXCLUDED.description,
          mission=EXCLUDED.mission,founder=EXCLUDED.founder,origin=EXCLUDED.origin,
          founded_on=EXCLUDED.founded_on,updated_at=now() RETURNING *`;
      return res.json({data:rows[0]});
    }
    if (action === 'member') {
      if (!isUuid(body.id)) return res.status(400).json({ error: 'Invalid member.' });
      const displayName = requireTitle(body.display_name,60);
      const ign = requireTitle(body.ign,40);
      const uid = str(body.uid,40);
      if (uid.length < 3) return res.status(400).json({ error: 'UID must contain at least 3 characters.' });
      const streamer = str(body.streamer_mode_id,100) || null;
      const team = str(body.team,80) || null;
      const rosterRole = str(body.role,80) || 'Member';
      const rows = await sql`WITH modified AS (
        UPDATE members SET display_name=${displayName},ign=${ign},uid=${uid},
          streamer_mode_id=${streamer},team=${team},role=${rosterRole},updated_at=now()
        WHERE id=${body.id}::uuid
        RETURNING id,user_id,display_name,ign,uid,streamer_mode_id,team,role,photo_url
      ), updated_application AS (
        UPDATE member_applications SET display_name=${displayName},ign=${ign},uid=${uid},
          streamer_mode_id=${streamer},updated_at=now()
        WHERE id IN (SELECT user_id FROM modified WHERE user_id IS NOT NULL)
        RETURNING id
      ) SELECT * FROM modified`;
      if (!rows.length) return res.status(404).json({ error: 'Member not found.' });
      return res.json({ data: rows[0] });
    }
    if (action === 'team_save') {
      const id = readId(body.id);
      const name = requireTitle(body.name,80);
      const description = str(body.description,400);
      const logo = optionalUrl(body.logo_url);
      const captain = readId(body.captain_member_id);
      const memberIds: string[] = Array.isArray(body.member_ids) ? [...new Set(body.member_ids)] : [];
      if (memberIds.length > 100 || memberIds.some(x=>!isUuid(x))) return res.status(400).json({ error: 'Invalid team member list.' });
      if (captain && !memberIds.includes(captain)) memberIds.push(captain);
      const teamId = id || randomUUID();
      // Team metadata and its roster are committed together or rolled back together.
      await sql.transaction([
        sql`INSERT INTO community_teams (id,name,description,logo_url,captain_member_id,updated_at)
          VALUES (${teamId}::uuid,${name},${description},${logo},${captain}::uuid,now())
          ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
            logo_url=EXCLUDED.logo_url,captain_member_id=EXCLUDED.captain_member_id,updated_at=now()`,
        sql`DELETE FROM community_team_members WHERE team_id=${teamId}::uuid`,
        sql`INSERT INTO community_team_members (team_id,member_id)
            SELECT ${teamId}::uuid,m.id FROM jsonb_array_elements_text(${JSON.stringify(memberIds)}::jsonb) ids(id)
            JOIN members m ON m.id=ids.id::uuid WHERE true ON CONFLICT DO NOTHING`,
      ]);
      return res.json({ data: { id: teamId } });
    }
    if (action === 'team_delete') {
      if (!isUuid(body.id)) return res.status(400).json({ error: 'Invalid team.' });
      await sql`DELETE FROM community_teams WHERE id=${body.id}::uuid`;
      return res.json({ data: { deleted: true } });
    }
    if (action === 'achievement_save') {
      const id = readId(body.id);
      const title = requireTitle(body.title);
      const subtitle = str(body.subtitle,120);
      const details = str(body.details,1500);
      const badge = str(body.badge,50) || 'ACHIEVEMENT';
      const image = optionalUrl(body.image_url);
      const date = body.achieved_on ? String(body.achieved_on) : null;
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date.' });
      const rows = await sql`INSERT INTO community_achievements (id,title,subtitle,details,badge,image_url,achieved_on,updated_at)
        VALUES (COALESCE(${id}::uuid,gen_random_uuid()),${title},${subtitle},${details},${badge},${image},${date}::date,now())
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,subtitle=EXCLUDED.subtitle,
          details=EXCLUDED.details,badge=EXCLUDED.badge,image_url=EXCLUDED.image_url,
          achieved_on=EXCLUDED.achieved_on,updated_at=now() RETURNING id`;
      return res.json({ data: rows[0] });
    }
    if (action === 'achievement_delete') {
      if (!isUuid(body.id)) return res.status(400).json({ error: 'Invalid achievement.' });
      await sql`DELETE FROM community_achievements WHERE id=${body.id}::uuid`;
      return res.json({ data: { deleted: true } });
    }
    if (action === 'gallery_save') {
      const id = readId(body.id);
      const title = requireTitle(body.title);
      const caption = str(body.caption,1000);
      const category = str(body.category,60) || 'COMMUNITY';
      const image = optionalUrl(body.image_url);
      if (!image) return res.status(400).json({ error: 'Upload a photo or provide its HTTPS URL.' });
      const rows = await sql`INSERT INTO community_gallery (id,title,caption,category,image_url,updated_at)
        VALUES (COALESCE(${id}::uuid,gen_random_uuid()),${title},${caption},${category},${image},now())
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,caption=EXCLUDED.caption,
          category=EXCLUDED.category,image_url=EXCLUDED.image_url,updated_at=now() RETURNING id`;
      return res.json({ data: rows[0] });
    }
    if (action === 'gallery_delete') {
      if (!isUuid(body.id)) return res.status(400).json({ error: 'Invalid gallery image.' });
      await sql`DELETE FROM community_gallery WHERE id=${body.id}::uuid`;
      return res.json({ data: { deleted: true } });
    }
    if (action === 'management_save') {
      if (!isUuid(body.user_id)) return res.status(400).json({ error: 'Invalid staff account.' });
      if (role === 'moderator' && body.user_id !== user.id)
        return res.status(403).json({ error: 'Moderators may edit only their own management profile.' });
      const name = str(body.display_name,80);
      const title = str(body.title,80);
      const bio = str(body.bio,600);
      const photo = optionalUrl(body.photo_url);
      const shown = body.show_public !== false;
      const rows = await sql`INSERT INTO community_management_profiles
        (user_id,display_name,title,bio,photo_url,show_public,updated_at)
        SELECT a.user_id,${name},${title},${bio},${photo},${shown},now()
        FROM community_admins a WHERE a.user_id=${body.user_id}::uuid
        ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
          title=EXCLUDED.title,bio=EXCLUDED.bio,photo_url=EXCLUDED.photo_url,
          show_public=EXCLUDED.show_public,updated_at=now() RETURNING user_id`;
      if (!rows.length) return res.status(404).json({ error: 'Staff account not found.' });
      return res.json({ data: rows[0] });
    }
    return res.status(404).json({ error: 'Unknown community action.' });
  } catch (error) {
    if (error instanceof PortalAuthError) return res.status(error.status).json({error:error.message});
    console.error('Asylum showcase request failed',error);
    const message = errText(error);
    if (/invalid|too long|must|contain|https:|duplicate key|unique constraint|foreign key/i.test(message))
      return res.status(400).json({ error: /duplicate key|unique constraint/i.test(message) ? 'That name already exists.' : /foreign key/i.test(message) ? 'Select an existing member.' : message });
    return res.status(500).json({ error: 'Unable to save right now. Please try again.' });
  }
}
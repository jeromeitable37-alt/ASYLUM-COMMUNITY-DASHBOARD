import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Ban, CheckCircle2, Crown, LockKeyhole, Pencil, RefreshCw, Save, Search, ShieldCheck, Trash2, UserRoundCog, Users, XCircle } from 'lucide-react';
import { readApiEnvelope } from './lib/read-api';
import './user-management.css';

export type PortalUser = {
  user_id: string;
  email: string;
  display_name: string;
  ign: string | null;
  staff_display_name: string | null;
  staff_ign: string | null;
  role: 'owner' | 'management' | 'admin' | 'moderator' | 'member';
  portal_status: 'active' | 'disabled' | 'removed';
  photo_url: string | null;
  application_status: string | null;
  has_member_profile: boolean;
  has_application: boolean;
  neon_auth_user_id: string | null;
  has_neon_login: boolean;
  neon_verified: boolean;
  neon_linked: boolean;
  created_at: string;
};

type Props = { currentUserId: string | null; onRoleUpdated?: () => void };

async function accountApi<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/dashboard?action=' + encodeURIComponent(action), {
    method: payload ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: payload ? { 'Content-Type': 'application/json' } : {},
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await readApiEnvelope<T>(response, 'Unable to update the account right now.');
  return result.data;
}

const roleLabels: Record<PortalUser['role'], string> = {
  owner: 'Owner', management: 'Management Admin', admin: 'Admin', moderator: 'Moderator', member: 'Member',
};

export default function UserManagement({ currentUserId, onRoleUpdated }: Props) {
  const [accounts, setAccounts] = useState<PortalUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<{ userId: string; displayName: string; ign: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const users = await accountApi<PortalUser[]>('users');
      setAccounts(users);
      setDraftRoles(Object.fromEntries(users.map(user => [user.user_id, user.role])));
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not load the registered accounts.' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  // Shared Supabase logins without a dashboard application are NOT official members.
  const isLinkedProfile = (user: PortalUser) =>
    user.has_member_profile || user.has_application || user.role !== 'member';
  const filtered = useMemo(() => accounts.filter(user => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [user.display_name, user.ign, user.email, user.user_id]
      .some(value => (value || '').toLowerCase().includes(q));
    const matchesFilter = roleFilter === 'all'
      ? isLinkedProfile(user) && user.portal_status !== 'removed'
      : roleFilter === 'unlinked'
        ? !isLinkedProfile(user) && user.portal_status !== 'removed'
        : roleFilter === 'removed'
          ? user.portal_status === 'removed'
          : user.role === roleFilter || user.portal_status === roleFilter;
    return matchesSearch && matchesFilter;
  }), [accounts, search, roleFilter]);
  const linkedCount = accounts.filter(isLinkedProfile).length;
  const unlinkedCount = accounts.filter(user => !isLinkedProfile(user) && user.portal_status !== 'removed').length;
  const staffCount = accounts.filter(user => user.role !== 'member' && user.portal_status === 'active').length;

  async function saveRole(user: PortalUser) {
    const nextRole = draftRoles[user.user_id];
    if (!nextRole || nextRole === user.role) return;
    if (!window.confirm(`Change ${user.ign || user.display_name} from ${roleLabels[user.role]} to ${roleLabels[nextRole as PortalUser['role']]}?`)) return;
    setBusy(user.user_id); setNotice(null);
    try {
      await accountApi('user_role', { user_id: user.user_id, role: nextRole });
      const latest = await accountApi<PortalUser[]>('users');
      setAccounts(latest);
      setDraftRoles(Object.fromEntries(latest.map(item => [item.user_id, item.role])));
      const persisted = latest.find(item => item.user_id === user.user_id);
      if (!persisted || persisted.role !== nextRole) {
        throw new Error('Neon has not confirmed the requested role change. No success was assumed.');
      }
      onRoleUpdated?.();
      setNotice({ type: 'success', message: `Role saved and verified for ${user.ign || user.display_name}.` });
    } catch (error) {
      setDraftRoles(current => ({ ...current, [user.user_id]: user.role }));
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not save role.' });
    } finally { setBusy(null); }
  }

  function beginStaffProfileEdit(user: PortalUser) {
    const name = user.staff_display_name?.trim()
      || (user.display_name === 'Community account' ? '' : user.display_name);
    setEditingStaff({userId:user.user_id,displayName:name,ign:user.staff_ign?.trim()||user.ign||''});
    setNotice(null);
  }

  async function saveStaffProfile(user: PortalUser) {
    if (!editingStaff || editingStaff.userId!==user.user_id ||
        user.role==='owner' || user.role==='member' || user.portal_status!=='active') return;
    const displayName=editingStaff.displayName.trim();
    const ign=editingStaff.ign.trim();
    if (displayName.length<2 || displayName.length>80 || ign.length<2 || ign.length>40) {
      setNotice({type:'error',message:'Staff name must be 2–80 characters and IGN must be 2–40 characters.'});
      return;
    }
    setBusy(user.user_id);setNotice(null);
    try {
      await accountApi('staff_profile',{user_id:user.user_id,display_name:displayName,ign});
      const latest=await accountApi<PortalUser[]>('users');
      setAccounts(latest);
      setDraftRoles(Object.fromEntries(latest.map(item=>[item.user_id,item.role])));
      const stored=latest.find(item=>item.user_id===user.user_id);
      if (stored?.staff_display_name!==displayName || stored.staff_ign!==ign)
        throw new Error('Neon did not confirm the staff profile changes.');
      setEditingStaff(null);
      setNotice({type:'success',message:'Staff name and IGN saved. Existing Management/Admin role and access stay unchanged.'});
    } catch(error) {
      setNotice({type:'error',message:error instanceof Error?error.message:'Unable to update the staff profile.'});
    } finally {setBusy(null);}
  }

  async function linkVerifiedStaff(user: PortalUser) {
    if (user.role==='owner'||user.role==='member'||!user.neon_verified||user.neon_linked||user.portal_status!=='active') return;
    if (!window.confirm('Link the verified Neon login for '+(user.ign||user.display_name)+
      ' to their existing staff record? Their role will stay unchanged.')) return;
    setBusy(user.user_id);setNotice(null);
    try {
      await accountApi('link_staff_neon',{user_id:user.user_id});
      const latest=await accountApi<PortalUser[]>('users');
      setAccounts(latest);
      setDraftRoles(Object.fromEntries(latest.map(item=>[item.user_id,item.role])));
      if (!latest.find(item=>item.user_id===user.user_id)?.neon_linked)
        throw new Error('Neon did not confirm the staff login link.');
      setNotice({type:'success',message:'Verified staff login linked. Existing role preserved.'});
    } catch(error) {
      setNotice({type:'error',message:error instanceof Error?error.message:'Unable to link this login.'});
    } finally {setBusy(null);}
  }

  async function changeStatus(user: PortalUser, nextStatus: PortalUser['portal_status']) {
    const isRemove = nextStatus === 'removed';
    const question = nextStatus === 'active'
      ? `Restore ${user.ign || user.display_name}'s Asylum portal access?`
      : isRemove
      ? `Archive ${user.ign || user.display_name} from this dashboard? This hides their profile and blocks their dashboard access. Their separate Neon Auth account remains intact; archive only affects this dashboard. You can restore this later.`
      : `Disable ${user.ign || user.display_name}'s Asylum portal access? This does not affect the separate Recruitment website.`;
    if (!window.confirm(question)) return;
    setBusy(user.user_id); setNotice(null);
    try {
      await accountApi('user_status', { user_id: user.user_id, portal_status: nextStatus });
      const latest = await accountApi<PortalUser[]>('users');
      setAccounts(latest);
      setDraftRoles(Object.fromEntries(latest.map(item => [item.user_id, item.role])));
      const persisted = latest.find(item => item.user_id === user.user_id);
      if (!persisted || persisted.portal_status !== nextStatus) {
        throw new Error('Neon did not confirm the requested account status. Refresh and check the record.');
      }
      setNotice({ type: 'success', message: `Account marked ${nextStatus} and verified in Neon.` });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not change account status.' });
    } finally { setBusy(null); }
  }

  return <section className="asy-user-management" id="user-management" aria-labelledby="asy-user-management-title">
    <div className="asy-user-management-heading">
      <div><div className="asy-user-kicker"><UserRoundCog size={16} /> OWNER ACCESS / ACCOUNT CONTROL</div>
        <h3 id="asy-user-management-title">User <span>Management.</span></h3>
        <p>Manage official member and staff profiles. Logins without an ASYLUM membership application are listed separately as unlinked accounts. Changes are recorded in the audit history.</p>
      </div>
      <button className="asy-user-refresh" type="button" onClick={() => void loadAccounts()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
    </div>
    <div className="asy-user-summary">
      <div><Users size={17} /><strong>{linkedCount.toString().padStart(2, '0')}</strong><span>MEMBER / STAFF</span></div>
      <div><CheckCircle2 size={17} /><strong>{unlinkedCount.toString().padStart(2, '0')}</strong><span>UNLINKED LOGINS</span></div>
      <div><ShieldCheck size={17} /><strong>{staffCount.toString().padStart(2, '0')}</strong><span>ACTIVE STAFF</span></div>
    </div>
    <div className="asy-user-toolbar">
      <label className="asy-user-search"><Search size={18} /> <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by IGN, name, or email" aria-label="Search registered users" /></label>
      <label className="asy-user-filter"><span>FILTER</span><select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
        <option value="all">Members & staff</option><option value="unlinked">Unlinked logins</option><option value="owner">Owner</option><option value="management">Management Admin</option><option value="admin">Admin</option><option value="moderator">Moderator</option><option value="member">Members</option><option value="disabled">Disabled</option><option value="removed">Removed</option>
      </select></label>
    </div>
    {notice && <div className={`asy-user-notice ${notice.type}`} role="status">{notice.type === 'error' ? <XCircle size={17} /> : <CheckCircle2 size={17} />}<span>{notice.message}</span><button type="button" onClick={()=>setNotice(null)} aria-label="Close notification">×</button></div>}
    {loading && <div className="asy-user-empty">Loading registered ASYLUM accounts…</div>}
    {!loading && <div className="asy-user-cards">
      {filtered.map(user => {
        const isOwner = user.role === 'owner' || user.user_id === currentUserId;
        const saving = busy === user.user_id;
        return <article className={`asy-user-card ${user.portal_status !== 'active' ? 'inactive' : ''}`} key={user.user_id}>
          <div className="asy-user-card-top">
            <div className="asy-user-identity">
              {user.photo_url ? <img className="asy-user-avatar" src={user.photo_url} alt="" loading="lazy" /> : <span className="asy-user-avatar fallback">{(user.ign || user.display_name || 'AS').slice(0,2).toUpperCase()}</span>}
              <div className="asy-user-identification"><h4>{isLinkedProfile(user) ? (user.ign || user.display_name) : 'Unlinked login'}</h4><small>{isLinkedProfile(user) ? (user.ign ? user.display_name : 'No IGN submitted yet') : 'No dashboard member profile or application'}</small></div>
            </div>
            <span className={`asy-user-state ${user.portal_status}`}>{user.portal_status === 'active' ? 'ACTIVE' : user.portal_status.toUpperCase()}</span>
          </div>
          <div className="asy-user-email" title={user.email}>{user.email}</div>
          <div className="asy-user-tags">{!isLinkedProfile(user) && <span><XCircle size={12}/> UNLINKED LOGIN</span>}<span><BadgeCheck size={12} /> {roleLabels[user.role]}</span>{isOwner && <span><Crown size={12} /> PROTECTED</span>}{user.application_status && <span>{user.application_status.toUpperCase()}</span>}</div>
          {user.role!=='member' && <div className="asy-user-neon-status">
            <small>{user.neon_linked ? 'NEON LOGIN: LINKED'
              : user.neon_verified ? 'NEON LOGIN: VERIFIED — OWNER LINK NEEDED'
              : user.has_neon_login ? 'NEON LOGIN: VERIFY EMAIL FIRST'
              : 'NEON LOGIN: ACTIVATION NEEDED'}</small>
            {!isOwner && user.neon_verified && !user.neon_linked && user.portal_status==='active' &&
              <button type="button" disabled={saving} onClick={()=>void linkVerifiedStaff(user)}>
                <ShieldCheck size={14}/> Link verified staff login
              </button>}

          </div>}
          {!isOwner && user.role !== 'member' && user.portal_status==='active' &&
            <div className="asy-staff-profile-editor">
              <button type="button" className="asy-staff-profile-toggle" disabled={saving}
                aria-expanded={editingStaff?.userId===user.user_id}
                onClick={()=>editingStaff?.userId===user.user_id ? setEditingStaff(null) : beginStaffProfileEdit(user)}>
                <Pencil size={14}/>{editingStaff?.userId===user.user_id ? 'Close editor' : 'Edit profile'}
              </button>
              {editingStaff?.userId===user.user_id &&
                <form className="asy-staff-profile-form" onSubmit={event=>{event.preventDefault();void saveStaffProfile(user);}}>
                  <label htmlFor={`staff-name-${user.user_id}`}>Staff full name</label>
                  <input id={`staff-name-${user.user_id}`} type="text" required minLength={2} maxLength={80}
                    autoComplete="name" placeholder="Full name"
                    value={editingStaff.displayName} disabled={saving}
                    onChange={event=>setEditingStaff(current=>current && current.userId===user.user_id
                      ? {...current,displayName:event.target.value} : current)}/>
                  <label htmlFor={`staff-ign-${user.user_id}`}>CODM IGN</label>
                  <input id={`staff-ign-${user.user_id}`} type="text" required minLength={2} maxLength={40}
                    placeholder="In-game name" autoComplete="off"
                    value={editingStaff.ign} disabled={saving}
                    onChange={event=>setEditingStaff(current=>current && current.userId===user.user_id
                      ? {...current,ign:event.target.value} : current)}/>
                  <small>Owner-only. Saves to the Management profile, not to member applications. Roles are unchanged.</small>
                  <div className="asy-staff-profile-actions">
                    <button type="submit" disabled={saving || editingStaff.displayName.trim().length<2 || editingStaff.ign.trim().length<2}>
                      <Save size={14}/>{saving ? 'Saving…' : 'Save profile'}
                    </button>
                    <button type="button" className="asy-staff-profile-cancel" disabled={saving} onClick={()=>setEditingStaff(null)}>
                      Cancel
                    </button>
                  </div>
                </form>}
            </div>}
          <div className="asy-user-card-divider" />
          <label className="asy-user-role-label" htmlFor={`role-${user.user_id}`}>DASHBOARD ACCESS ROLE</label>
          <div className="asy-user-role-row"><select id={`role-${user.user_id}`} value={draftRoles[user.user_id] || user.role} onChange={e => setDraftRoles(current => ({ ...current, [user.user_id]: e.target.value }))} disabled={isOwner || saving || user.portal_status !== 'active'}>
            <option value="member">Member</option><option value="moderator">Moderator</option><option value="admin">Admin</option><option value="management">Management Admin</option>{isOwner && <option value="owner">Owner</option>}
          </select><button type="button" disabled={isOwner || saving || user.portal_status !== 'active' || (draftRoles[user.user_id] || user.role) === user.role} onClick={()=>void saveRole(user)}><ShieldCheck size={15} /> Save</button></div>
          <div className="asy-user-action-row">
            {isOwner ? <span className="asy-user-owner-note"><LockKeyhole size={13} /> Owner account is protected</span> : <>
              {user.portal_status === 'active' ? <button type="button" className="asy-user-disable" disabled={saving} onClick={()=>void changeStatus(user,'disabled')}><Ban size={14} /> Disable</button> : <button type="button" className="asy-user-restore" disabled={saving} onClick={()=>void changeStatus(user,'active')}><CheckCircle2 size={14} /> Restore</button>}
              {user.portal_status !== 'removed' && <button type="button" className="asy-user-remove" disabled={saving} onClick={()=>void changeStatus(user,'removed')}><Trash2 size={14} /> Archive</button>}
            </>}
          </div>
        </article>;
      })}
      {filtered.length === 0 && <div className="asy-user-empty">No accounts match this filter. Use “Unlinked logins” to review sign-in records without member profiles, or “Removed” to restore archived entries.</div>}
    </div>}
    <div className="asy-user-footnote"><LockKeyhole size={15} /><span><strong>Portal-only management:</strong> Disable/Archive blocks access to this dashboard and hides its public member profile. Neon Auth accounts are preserved. Recruitment and other websites use separate authentication and remain unaffected. Check “Unlinked logins” before archiving records without member applications.</span></div>
  </section>;
}
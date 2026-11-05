import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Ban, CheckCircle2, Crown, LockKeyhole, RefreshCw, Search, ShieldCheck, Trash2, UserRoundCog, Users, XCircle } from 'lucide-react';
import { supabase } from './lib/supabase';
import { readApiEnvelope } from './lib/read-api';
import './user-management.css';

export type PortalUser = {
  user_id: string;
  email: string;
  display_name: string;
  ign: string | null;
  role: 'owner' | 'management' | 'admin' | 'moderator' | 'member';
  portal_status: 'active' | 'disabled' | 'removed';
  photo_url: string | null;
  application_status: string | null;
  has_member_profile: boolean;
  has_application: boolean;
  created_at: string;
};

type Props = { currentUserId: string | null; onRoleUpdated?: () => void };

async function accountApi<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired. Please sign in again.');
  const response = await fetch(`/api/dashboard?action=${encodeURIComponent(action)}`, {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await readApiEnvelope<T>(response, 'Unable to update account.');
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
      // Read back the actual saved role instead of claiming success based
      // solely on the POST response. Reload all account cards and role drafts.
      const latest = await accountApi<PortalUser[]>('users');
      const persisted = latest.find(item => item.user_id === user.user_id);
      setAccounts(latest);
      setDraftRoles(Object.fromEntries(latest.map(item => [item.user_id, item.role])));
      if (!persisted || persisted.role !== nextRole) {
        throw new Error('The database did not confirm the requested role. Refresh and check again.');
      }
      onRoleUpdated?.();
      setNotice({ type: 'success', message: `Role saved and confirmed for ${user.ign || user.display_name}.` });
    } catch (error) {
      setDraftRoles(current => ({ ...current, [user.user_id]: user.role }));
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not save role.' });
    } finally { setBusy(null); }
  }

  async function changeStatus(user: PortalUser, nextStatus: PortalUser['portal_status']) {
    const isRemove = nextStatus === 'removed';
    const question = nextStatus === 'active'
      ? `Restore ${user.ign || user.display_name}'s Asylum portal access?`
      : isRemove
      ? `Archive ${user.ign || user.display_name} from this dashboard? This hides their profile and blocks their dashboard access. Their Supabase login and access to other websites will remain unchanged. You can restore this later.`
      : `Disable ${user.ign || user.display_name}'s Asylum portal access? This does not affect the separate Recruitment website.`;
    if (!window.confirm(question)) return;
    setBusy(user.user_id); setNotice(null);
    try {
      await accountApi('user_status', { user_id: user.user_id, portal_status: nextStatus });
      // Confirm Neon persisted the change before showing success to the Owner.
      const latest = await accountApi<PortalUser[]>('users');
      const persisted = latest.find(item => item.user_id === user.user_id);
      setAccounts(latest);
      setDraftRoles(Object.fromEntries(latest.map(item => [item.user_id, item.role])));
      if (!persisted || persisted.portal_status !== nextStatus) {
        throw new Error('Neon did not confirm the requested account status. Please refresh and check the record.');
      }
      setNotice({ type: 'success', message: `Account marked ${nextStatus} and confirmed in Neon. Existing records are preserved.` });
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
    <div className="asy-user-footnote"><LockKeyhole size={15} /><span><strong>Portal-only management:</strong> Disable/Archive blocks access to this dashboard and hides its public member profile. No Supabase authentication account is deleted. Recruitment and other websites remain unaffected. Check “Unlinked logins” before archiving records without member applications.</span></div>
  </section>;
}
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Ban, CheckCircle2, Crown, LockKeyhole, RefreshCw, Search, ShieldCheck, Trash2, UserRoundCog, Users, XCircle } from 'lucide-react';
import { supabase } from './lib/supabase';

export type PortalUser = {
  user_id: string;
  email: string;
  display_name: string;
  ign: string | null;
  role: 'owner' | 'management' | 'admin' | 'moderator' | 'member';
  portal_status: 'active' | 'disabled' | 'removed';
  photo_url: string | null;
  application_status: string | null;
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
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to update account.');
  return result.data as T;
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

  const filtered = useMemo(() => accounts.filter(user => {
    const q = search.trim().toLowerCase();
    return (!q || [user.display_name, user.ign, user.email, user.user_id].some(value => (value || '').toLowerCase().includes(q)))
      && (roleFilter === 'all' || user.role === roleFilter || user.portal_status === roleFilter);
  }), [accounts, search, roleFilter]);
  const activeCount = accounts.filter(user => user.portal_status === 'active').length;
  const staffCount = accounts.filter(user => user.role !== 'member').length;

  async function saveRole(user: PortalUser) {
    const nextRole = draftRoles[user.user_id];
    if (!nextRole || nextRole === user.role) return;
    if (!window.confirm(`Change ${user.ign || user.display_name} from ${roleLabels[user.role]} to ${roleLabels[nextRole as PortalUser['role']]}?`)) return;
    setBusy(user.user_id); setNotice(null);
    try {
      await accountApi('user_role', { user_id: user.user_id, role: nextRole });
      setAccounts(current => current.map(item => item.user_id === user.user_id ? { ...item, role: nextRole as PortalUser['role'] } : item));
      onRoleUpdated?.();
      setNotice({ type: 'success', message: `Role updated for ${user.ign || user.display_name}.` });
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
      ? `Remove ${user.ign || user.display_name} from the Asylum portal? Their records are archived (not permanently deleted) and can be restored.`
      : `Disable ${user.ign || user.display_name}'s Asylum portal access? This does not affect the separate Recruitment website.`;
    if (!window.confirm(question)) return;
    setBusy(user.user_id); setNotice(null);
    try {
      await accountApi('user_status', { user_id: user.user_id, portal_status: nextStatus });
      setAccounts(current => current.map(item => item.user_id === user.user_id ? { ...item, portal_status: nextStatus } : item));
      setNotice({ type: 'success', message: `Account marked ${nextStatus}. Existing records are preserved.` });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not change account status.' });
    } finally { setBusy(null); }
  }

  return <section className="asy-user-management" aria-labelledby="asy-user-management-title">
    <div className="asy-user-management-heading">
      <div><div className="asy-user-kicker"><UserRoundCog size={16} /> OWNER ACCESS / ACCOUNT CONTROL</div>
        <h3 id="asy-user-management-title">User <span>Management.</span></h3>
        <p>Manage registered accounts directly—no need to search for an email before changing roles. Changes are recorded in the audit history.</p>
      </div>
      <button className="asy-user-refresh" type="button" onClick={() => void loadAccounts()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
    </div>
    <div className="asy-user-summary">
      <div><Users size={17} /><strong>{accounts.length.toString().padStart(2, '0')}</strong><span>REGISTERED</span></div>
      <div><CheckCircle2 size={17} /><strong>{activeCount.toString().padStart(2, '0')}</strong><span>ACTIVE</span></div>
      <div><ShieldCheck size={17} /><strong>{staffCount.toString().padStart(2, '0')}</strong><span>STAFF</span></div>
    </div>
    <div className="asy-user-toolbar">
      <label className="asy-user-search"><Search size={18} /> <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by IGN, name, or email" aria-label="Search registered users" /></label>
      <label className="asy-user-filter"><span>FILTER</span><select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
        <option value="all">All accounts</option><option value="owner">Owner</option><option value="management">Management Admin</option><option value="admin">Admin</option><option value="moderator">Moderator</option><option value="member">Members</option><option value="disabled">Disabled</option><option value="removed">Removed</option>
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
              <div className="asy-user-identification"><h4>{user.ign || user.display_name}</h4><small>{user.ign ? user.display_name : 'No IGN submitted yet'}</small></div>
            </div>
            <span className={`asy-user-state ${user.portal_status}`}>{user.portal_status === 'active' ? 'ACTIVE' : user.portal_status.toUpperCase()}</span>
          </div>
          <div className="asy-user-email" title={user.email}>{user.email}</div>
          <div className="asy-user-tags"><span><BadgeCheck size={12} /> {roleLabels[user.role]}</span>{isOwner && <span><Crown size={12} /> PROTECTED</span>}{user.application_status && <span>{user.application_status.toUpperCase()}</span>}</div>
          <div className="asy-user-card-divider" />
          <label className="asy-user-role-label" htmlFor={`role-${user.user_id}`}>DASHBOARD ACCESS ROLE</label>
          <div className="asy-user-role-row"><select id={`role-${user.user_id}`} value={draftRoles[user.user_id] || user.role} onChange={e => setDraftRoles(current => ({ ...current, [user.user_id]: e.target.value }))} disabled={isOwner || saving || user.portal_status !== 'active'}>
            <option value="member">Member</option><option value="moderator">Moderator</option><option value="admin">Admin</option><option value="management">Management Admin</option>{isOwner && <option value="owner">Owner</option>}
          </select><button type="button" disabled={isOwner || saving || user.portal_status !== 'active' || (draftRoles[user.user_id] || user.role) === user.role} onClick={()=>void saveRole(user)}><ShieldCheck size={15} /> Save</button></div>
          <div className="asy-user-action-row">
            {isOwner ? <span className="asy-user-owner-note"><LockKeyhole size={13} /> Owner account is protected</span> : <>
              {user.portal_status === 'active' ? <button type="button" className="asy-user-disable" disabled={saving} onClick={()=>void changeStatus(user,'disabled')}><Ban size={14} /> Disable</button> : <button type="button" className="asy-user-restore" disabled={saving} onClick={()=>void changeStatus(user,'active')}><CheckCircle2 size={14} /> Restore</button>}
              {user.portal_status !== 'removed' && <button type="button" className="asy-user-remove" disabled={saving} onClick={()=>void changeStatus(user,'removed')}><Trash2 size={14} /> Remove</button>}
            </>}
          </div>
        </article>;
      })}
      {filtered.length === 0 && <div className="asy-user-empty">No registered accounts match this search.</div>}
    </div>}
    <div className="asy-user-footnote"><LockKeyhole size={15} /><span><strong>Portal-only management:</strong> Disable/Remove blocks access to this official dashboard and hides public portal profiles. Records remain recoverable. Because Recruitment shares Supabase authentication, this does not automatically disable an account on the separate Recruitment website.</span></div>
  </section>;
}
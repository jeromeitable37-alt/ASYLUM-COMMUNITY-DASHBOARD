import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Ban, CheckCircle2, Crown, Pencil, RefreshCw, Save, Search, ShieldCheck, Trash2, UserRoundCog, Users, XCircle } from 'lucide-react';
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
  const [roleFilter, setRoleFilter] = useState('staff');
  const [visibleCount, setVisibleCount] = useState(12);
  const [managingUserId, setManagingUserId] = useState<string | null>(null);
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

  // A verified login is not automatically an approved member profile.
  // Staff retain their existing role without a member application.
  const isLinkedProfile = (user: PortalUser) =>
    user.has_member_profile || user.has_application || user.role !== 'member';
  const filtered = useMemo(() => accounts.filter(user => {
    const q = search.trim().toLowerCase();
    if (q && ![user.display_name, user.ign, user.email, user.user_id, user.staff_display_name, user.staff_ign]
      .some(value => (value || '').toLowerCase().includes(q))) return false;
    if (roleFilter === 'removed') return user.portal_status === 'removed';
    if (roleFilter === 'disabled') return user.portal_status === 'disabled';
    if (user.portal_status !== 'active') return false;
    switch(roleFilter) {
      case 'staff': return user.role !== 'member';
      case 'members': return user.role === 'member' && isLinkedProfile(user);
      case 'pending': return user.role === 'member' && user.application_status === 'pending';
      case 'no-profile': return user.role === 'member' && !isLinkedProfile(user);
      case 'all': return true;
      default: return user.role === roleFilter;
    }
  }), [accounts, search, roleFilter]);
  const staffCount = accounts.filter(user => user.role !== 'member' && user.portal_status === 'active').length;
  const memberCount = accounts.filter(user => user.role === 'member' &&
    user.portal_status === 'active' && isLinkedProfile(user)).length;
  const pendingCount = accounts.filter(user => user.role === 'member' &&
    user.portal_status === 'active' && user.application_status === 'pending').length;
  const editingAccount = accounts.find(user => user.user_id === editingStaff?.userId);
  const managingAccount = accounts.find(user => user.user_id === managingUserId);
  const visibleUsers = filtered.slice(0,visibleCount);

  useEffect(() => {
    if (!editingStaff && !managingUserId) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setEditingStaff(null);
        setManagingUserId(null);
      }
    };
    window.addEventListener('keydown',onEscape);
    return () => window.removeEventListener('keydown',onEscape);
  }, [editingStaff,managingUserId,busy]);

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
      setManagingUserId(null);
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
      setManagingUserId(null);
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
      setManagingUserId(null);
      setNotice({ type: 'success', message: `Account marked ${nextStatus} and verified in Neon.` });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not change account status.' });
    } finally { setBusy(null); }
  }

  return <section className="asy-user-management" id="user-management" aria-labelledby="asy-user-management-title">
    <div className="asy-user-management-heading">
      <div><div className="asy-user-kicker"><UserRoundCog size={15}/> MANAGEMENT ACCESS / ACCOUNT CONTROL</div>
        <h3 id="asy-user-management-title">User <span>Management.</span></h3>
        <p>Staff accounts and community registrations, organized in one place.</p>
      </div>
      <button className="asy-user-refresh" type="button" onClick={() => void loadAccounts()} disabled={loading}>
        <RefreshCw size={15}/> Refresh
      </button>
    </div>

    <div className="asy-user-summary">
      <div><ShieldCheck size={16}/><strong>{staffCount}</strong><span>ACTIVE STAFF</span></div>
      <div><Users size={16}/><strong>{memberCount}</strong><span>MEMBER RECORDS</span></div>
      <div><BadgeCheck size={16}/><strong>{pendingCount}</strong><span>PENDING REVIEW</span></div>
    </div>

    <div className="asy-user-toolbar">
      <label className="asy-user-search"><Search size={17}/>
        <input value={search} onChange={event=>{setSearch(event.target.value);setVisibleCount(12);}}
          placeholder="Search name, IGN, or email" aria-label="Search registered users"/>
      </label>
      <label className="asy-user-filter"><span>VIEW</span><select value={roleFilter} onChange={event=>{setRoleFilter(event.target.value);setVisibleCount(12);}}>
        <option value="staff">Management &amp; Admin</option>
        <option value="members">Member records</option>
        <option value="pending">Pending applications</option>
        <option value="no-profile">Needs member profile</option>
        <option value="all">All active accounts</option>
        <option value="owner">Owner</option>
        <option value="management">Management Admin only</option>
        <option value="admin">Admin only</option>
        <option value="moderator">Moderator only</option>
        <option value="disabled">Disabled</option>
        <option value="removed">Archived</option>
      </select></label>
    </div>
    <p className="asy-user-guide">New Official Dashboard sign-ups appear under Member records after submitting their profile. Accounts still finishing registration appear under Needs member profile. Recruitment applications are managed separately.</p>
    {notice && <div className={'asy-user-notice '+notice.type} role="status">
      {notice.type==='error'?<XCircle size={16}/>:<CheckCircle2 size={16}/>}
      <span>{notice.message}</span>
      <button type="button" onClick={()=>setNotice(null)} aria-label="Close notification">×</button>
    </div>}

    {loading ? <div className="asy-user-empty">Loading accounts…</div> : <>
      <div className="asy-user-result-count" role="status">
        Showing {visibleUsers.length} of {filtered.length} account{filtered.length===1?'':'s'}
      </div>
      <div className="asy-user-cards">
        {visibleUsers.map(user=>{
          const isOwner=user.role==='owner'||user.user_id===currentUserId;
          const saving=busy===user.user_id;
          const hasProfile=isLinkedProfile(user);
          const heading=hasProfile?(user.ign||user.display_name):'Account pending profile';
          const description=hasProfile
            ? user.ign && user.display_name!=='Community account' ? user.display_name
              : user.role!=='member' ? 'Profile details not yet added' : 'Profile on file'
            : 'Registration not completed';
          return <article className={'asy-user-card'+(user.portal_status!=='active'?' inactive':'')} key={user.user_id}>
            <div className="asy-user-card-top">
              <div className="asy-user-identity">
                {user.photo_url ? <img className="asy-user-avatar" src={user.photo_url} alt="" loading="lazy"/> :
                  <span className="asy-user-avatar fallback">{(user.ign||user.display_name||'AS').slice(0,2).toUpperCase()}</span>}
                <div className="asy-user-identification">
                  <h4 title={heading}>{heading}</h4>
                  <small title={description}>{description}</small>
                </div>
              </div>
              <span className={'asy-user-state '+user.portal_status}>{user.portal_status==='active'?'ACTIVE':user.portal_status==='removed'?'ARCHIVED':user.portal_status.toUpperCase()}</span>
            </div>
            <div className="asy-user-email" title={user.email}>{user.email}</div>
            <div className="asy-user-tags">
              <span><BadgeCheck size={11}/>{roleLabels[user.role]}</span>
              {user.application_status==='pending' && <span className="asy-user-tag-pending">PENDING</span>}
              {user.application_status==='rejected' && <span className="asy-user-tag-rejected">REJECTED</span>}
            </div>
            <div className="asy-user-card-footer">
              {isOwner ? <span className="asy-user-owner-note"><Crown size={14}/> Owner protected</span> : <>
                {user.role!=='member' && user.portal_status==='active' &&
                  <button type="button" className="asy-user-edit-compact" disabled={saving} onClick={()=>beginStaffProfileEdit(user)}>
                    <Pencil size={13}/> Edit
                  </button>}
                <button type="button" className="asy-user-manage-compact" disabled={saving} onClick={()=>{setManagingUserId(user.user_id);setNotice(null);}}>
                  <UserRoundCog size={14}/> Manage
                </button>
              </>}
            </div>
          </article>;
        })}
      </div>
      {filtered.length===0 && <div className="asy-user-empty">No accounts found in this view. Try a different filter or search.</div>}
      {filtered.length>visibleCount && <button type="button" className="asy-user-more"
        onClick={()=>setVisibleCount(count=>count+12)}>
        Show 12 more ({filtered.length-visibleCount} remaining)
      </button>}
    </>}

    {editingStaff && editingAccount && <div className="asy-user-modal-backdrop"
      onMouseDown={event=>{if(event.target===event.currentTarget && !busy)setEditingStaff(null);}}>
      <section className="asy-user-modal" role="dialog" aria-modal="true" aria-labelledby="asy-edit-staff-title">
        <div className="asy-user-modal-heading">
          <div><span className="asy-user-modal-eyebrow">AUTHORIZED STAFF</span>
            <h4 id="asy-edit-staff-title">Edit staff profile</h4>
            <p>{editingAccount.email}</p>
          </div>
          <button type="button" className="asy-user-modal-close" onClick={()=>setEditingStaff(null)}
            aria-label="Close editor" disabled={Boolean(busy)}>×</button>
        </div>
        {notice?.type==="error" && <p className="asy-user-modal-error" role="alert">{notice.message}</p>}
        <form className="asy-staff-profile-form" onSubmit={event=>{event.preventDefault();void saveStaffProfile(editingAccount);}}>
          <label htmlFor="staff-profile-fullname">Staff full name</label>
          <input id="staff-profile-fullname" autoFocus required minLength={2} maxLength={80}
            autoComplete="name" placeholder="Full name" disabled={Boolean(busy)}
            value={editingStaff.displayName}
            onChange={event=>setEditingStaff(current=>current?{...current,displayName:event.target.value}:current)}/>
          <label htmlFor="staff-profile-ign">CODM IGN</label>
          <input id="staff-profile-ign" required minLength={2} maxLength={40}
            autoComplete="off" placeholder="In-game name" disabled={Boolean(busy)}
            value={editingStaff.ign}
            onChange={event=>setEditingStaff(current=>current?{...current,ign:event.target.value}:current)}/>
          <small>Only the display name and IGN change. Role, email, password, and member applications stay untouched.</small>
          <div className="asy-staff-profile-actions">
            <button type="submit" disabled={Boolean(busy)||editingStaff.displayName.trim().length<2||editingStaff.ign.trim().length<2}>
              <Save size={14}/>{busy?'Saving…':'Save profile'}
            </button>
            <button type="button" className="asy-staff-profile-cancel" onClick={()=>setEditingStaff(null)} disabled={Boolean(busy)}>Cancel</button>
          </div>
        </form>
      </section>
    </div>}

    {managingAccount && managingAccount.user_id!==currentUserId && managingAccount.role!=='owner' &&
      <div className="asy-user-modal-backdrop"
        onMouseDown={event=>{if(event.target===event.currentTarget && !busy)setManagingUserId(null);}}>
        <section className="asy-user-modal" role="dialog" aria-modal="true" aria-labelledby="asy-manage-account-title">
          <div className="asy-user-modal-heading">
            <div><span className="asy-user-modal-eyebrow">AUTHORIZED STAFF</span>
              <h4 id="asy-manage-account-title">Manage account</h4>
              <p>{managingAccount.email}</p>
            </div>
            <button type="button" className="asy-user-modal-close" aria-label="Close account manager"
              disabled={Boolean(busy)} onClick={()=>setManagingUserId(null)}>×</button>
          </div>
          <div className="asy-user-manage-content">
            {notice?.type==="error" && <p className="asy-user-modal-error" role="alert">{notice.message}</p>}
            <label className="asy-user-role-label" htmlFor="asy-manage-role">DASHBOARD ACCESS ROLE</label>
            <div className="asy-user-role-row">
              <select id="asy-manage-role" value={draftRoles[managingAccount.user_id]||managingAccount.role}
                onChange={event=>setDraftRoles(current=>({...current,[managingAccount.user_id]:event.target.value}))}
                disabled={Boolean(busy)||managingAccount.portal_status!=='active'}>
                <option value="member">Member</option><option value="moderator">Moderator</option>
                <option value="admin">Admin</option><option value="management">Management Admin</option>
              </select>
              <button type="button" onClick={()=>void saveRole(managingAccount)}
                disabled={Boolean(busy)||managingAccount.portal_status!=='active'||
                  (draftRoles[managingAccount.user_id]||managingAccount.role)===managingAccount.role}>
                <ShieldCheck size={14}/> Save
              </button>
            </div>
            {managingAccount.role!=='member' && managingAccount.portal_status==='active' &&
              managingAccount.neon_verified && !managingAccount.neon_linked &&
              <button type="button" className="asy-user-link-login" disabled={Boolean(busy)}
                onClick={()=>void linkVerifiedStaff(managingAccount)}>
                <ShieldCheck size={15}/> Link verified staff account
              </button>}
            <div className="asy-user-action-row">
              {managingAccount.portal_status==='active'
                ? <button type="button" disabled={Boolean(busy)} onClick={()=>void changeStatus(managingAccount,'disabled')}>
                    <Ban size={14}/> Disable access
                  </button>
                : <button type="button" className="asy-user-restore" disabled={Boolean(busy)}
                    onClick={()=>void changeStatus(managingAccount,'active')}>
                    <CheckCircle2 size={14}/> Restore access
                  </button>}
              {managingAccount.portal_status!=='removed' &&
                <button type="button" className="asy-user-remove" disabled={Boolean(busy)}
                  onClick={()=>void changeStatus(managingAccount,'removed')}>
                  <Trash2 size={14}/> Archive
                </button>}
            </div>
            <p className="asy-user-manage-help">Changing access here affects only the Official Dashboard. Recruitment and Jersey sites stay separate.</p>
          </div>
        </section>
      </div>}
  </section>;
}

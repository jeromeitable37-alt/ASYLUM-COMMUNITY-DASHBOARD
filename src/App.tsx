import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity, ArrowUpRight, CheckCircle2, Crown, Fingerprint,
  LockKeyhole, LogIn, Menu, Search, ShieldCheck, Swords, UserPlus, Users, X, Shirt, ExternalLink, Orbit, ArrowRight, Pencil, Save, Globe2,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import CommunityShowcase from './CommunityShowcase';

type Member = { id: string; user_id?: string | null; display_name: string; ign: string | null; uid: string | null; streamer_mode_id: string | null; team: string | null; role: string; photo_url: string | null };
type Application = { id: string; display_name: string; ign: string; uid: string; streamer_mode_id: string | null; photo_url: string | null; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string };
type Notice = { kind: 'success' | 'error' | 'info'; text: string };
type AdminRole = 'owner' | 'management' | 'moderator' | 'admin';
type AdminAccount = { user_id: string; email: string | null; role: AdminRole; created_at: string; photo_url?: string | null };

const managementRoles = [
  { role: 'Community Owner', description: 'Overall community leadership and final approval.' },
  { role: 'Management', description: 'Member records, team assignments, and community operations.' },
  { role: 'Moderation', description: 'Community safety, reports, and member support.' },
];

async function dashboard<T>(action: string, opts?: { body?: Record<string, unknown>, token?: string }): Promise<T> {
  const token = opts?.token || (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch('/api/dashboard?action=' + encodeURIComponent(action), {
    method: opts?.body ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const output = await res.json();
  if (!res.ok) throw new Error(output.error || 'Server request failed.');
  return output.data as T;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState('Members');
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [showAuth, setShowAuth] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState<AdminRole | null>(null);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [managementPhotoUrl, setManagementPhotoUrl] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState<'management' | 'moderator' | 'remove'>('management');
  const [transferEmail, setTransferEmail] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [application, setApplication] = useState<Application | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [ign, setIgn] = useState('');
  const [uid, setUid] = useState('');
  const [streamerModeId, setStreamerModeId] = useState('');
  const [editingStreamerFor, setEditingStreamerFor] = useState<string | null>(null);
  const [streamerDraft, setStreamerDraft] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const directory = await dashboard<Member[]>('directory');
        if (active) setMembers(directory ?? []);
        if (!session?.user) {
          if (active) { setIsAdmin(false); setCurrentRole(null); setAdminAccounts([]); setApplication(null); setApplications([]); }
          return;
        }
        await dashboard('bootstrap', { body: { init: true } });
        const profile = await dashboard<{ application: Application | null, admin: { role: AdminRole, photo_url: string | null } | null }>('profile');
        if (!active) return;
        const role = profile.admin?.role ?? null;
        setCurrentRole(role);
        setManagementPhotoUrl(profile.admin?.photo_url ?? null);
        const admin = role === 'owner' || role === 'management' || role === 'admin' || role === 'moderator';
        setIsAdmin(admin);
        setApplication(profile.application);
        if (role === 'owner') {
          const accounts = await dashboard<AdminAccount[]>('admins');
          if (active) setAdminAccounts(accounts ?? []);
        } else if (active) setAdminAccounts([]);
        if (admin) {
          const queue = await dashboard<{ applications: Application[], members: Member[] }>('queue');
          if (active) { setApplications(queue.applications); setMembers(queue.members); }
        } else if (active) setApplications([]);
      } catch (error) {
        if (active) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load dashboard data.' });
      }
    };
    void load();
    return () => { active = false; };
  }, [session?.user?.id]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter(member => !q ||
      (member.ign ?? '').toLowerCase().includes(q) ||
      (member.uid ?? '').toLowerCase().includes(q) ||
      (member.streamer_mode_id ?? '').toLowerCase().includes(q) ||
      (member.team ?? '').toLowerCase().includes(q) ||
      member.display_name.toLowerCase().includes(q));
  }, [members, query]);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const uploadPhoto = async (userId: string, file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP image.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Profile pictures must be 5 MB or smaller.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = userId + '/' + Date.now() + '-' + safeName;
    const { error } = await supabase.storage.from('community-photos').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from('community-photos').getPublicUrl(path);
    await dashboard('bootstrap', { body: { init: true } });
    await dashboard('photo', { body: { kind: 'application', photo_url: data.publicUrl } });
  };

  const uploadOwnMemberPhoto = async (file: File) => {
    if (!session?.user) throw new Error('Sign in to update your profile picture.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP under 5 MB.');
    setBusy(true); setNotice(null);
    try {
      const path = session.user.id + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const { error } = await supabase.storage.from('community-photos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('community-photos').getPublicUrl(path);
      await dashboard('photo', { body: { kind: 'self', photo_url: data.publicUrl } });
      setApplication(current => current ? { ...current, photo_url: data.publicUrl } : current);
      setMembers(current => current.map(member => member.user_id === session.user.id ? { ...member, photo_url: data.publicUrl } : member));
      setNotice({ kind: 'success', text: 'Your profile picture has been updated.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save your picture.' }); }
    finally { setBusy(false); }
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        throw new Error('Login is not configured on this deployment. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel Environment Variables, then redeploy.');
      }
      if (authMode === 'signup') {
        const cleanName = displayName.trim(), cleanIgn = ign.trim(), cleanUid = uid.trim();
        if (cleanName.length < 2 || cleanIgn.length < 2 || cleanUid.length < 3) throw new Error('Enter your name, IGN (at least 2 characters), and UID (at least 3 characters).');
        if (photoFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(photoFile.type) || photoFile.size > 5 * 1024 * 1024)) throw new Error('Choose a JPG, PNG, or WebP image that is 5 MB or smaller.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: cleanName, ign: cleanIgn, uid: cleanUid, streamer_mode_id: streamerModeId.trim() || null } },
        });
        if (error) throw error;
        if (data.session) await dashboard('bootstrap', { body: { init: true }, token: data.session.access_token });
        if (data.session && data.user && photoFile) await uploadPhoto(data.user.id, photoFile);
        if (data.session) setShowAuth(false);
        setNotice({ kind: 'success', text: data.session
          ? 'Registration submitted! Your application is waiting for management approval.'
          : 'Check your email to confirm your account, then sign in to finish your profile photo upload. Your application will appear after you confirm your email and sign in.' });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session?.access_token) throw new Error('Authentication succeeded, but no login session was returned.');
        setShowAuth(false);
        setPassword('');
        try {
          await dashboard('bootstrap', { body: { init: true }, token: data.session.access_token });
          if (data.user && photoFile) await uploadPhoto(data.user.id, photoFile);
          setNotice({ kind: 'success', text: 'You are signed in.' });
        } catch (setupError) {
          setNotice({ kind: 'error', text: 'Login succeeded, but dashboard initialization failed: ' + (setupError instanceof Error ? setupError.message : 'Check the database and Vercel settings.') });
        }
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Something went wrong. Please try again.' });
    } finally { setBusy(false); }
  };

  // Staff can complete Streamer Mode details for already-registered members.
  const saveStreamerModeId = async (member: Member) => {
    if (!isAdmin) return;
    setBusy(true); setNotice(null);
    try {
      const saved = await dashboard<{ id: string; streamer_mode_id: string | null }>('set_streamer_id', {
        body: { member_id: member.id, streamer_mode_id: streamerDraft.trim() },
      });
      setMembers(current => current.map(item => item.id === member.id
        ? { ...item, streamer_mode_id: saved.streamer_mode_id } : item));
      setEditingStreamerFor(null);
      setNotice({ kind: 'success', text: 'Streamer Mode ID saved for ' + (member.ign || member.display_name) + '.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to update Streamer Mode ID.' });
    } finally { setBusy(false); }
  };

  const uploadDirectoryPhoto = async (member: Member, file: File) => {
    if (!session?.user || !isAdmin) throw new Error('Management account required.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Use a JPG, PNG, or WebP under 5 MB.');
    setBusy(true); setNotice(null);
    try {
      const path = 'members/' + member.id + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const { error } = await supabase.storage.from('community-photos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('community-photos').getPublicUrl(path);
      await dashboard('photo', { body: { kind: 'member', member_id: member.id, photo_url: data.publicUrl } });
      setMembers(current => current.map(item => item.id === member.id ? { ...item, photo_url: data.publicUrl } : item));
      setNotice({ kind: 'success', text: 'Profile picture updated.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to upload picture.' }); }
    finally { setBusy(false); }
  };

  const uploadManagementPhoto = async (file: File) => {
    if (!session?.user || !currentRole) throw new Error('Sign in as management first.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Use a JPG, PNG, or WebP under 5 MB.');
    setBusy(true); setNotice(null);
    try {
      const path = 'management/' + session.user.id + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const { error } = await supabase.storage.from('community-photos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('community-photos').getPublicUrl(path);
      await dashboard('photo', { body: { kind: 'admin', photo_url: data.publicUrl } });
      setManagementPhotoUrl(data.publicUrl);
      setNotice({ kind: 'success', text: 'Management profile picture saved.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save photo.' }); }
    finally { setBusy(false); }
  };

  const reviewApplication = async (item: Application, status: 'approved' | 'rejected') => {
    setBusy(true); setNotice(null);
    try {
      await dashboard('review', { body: { id: item.id, status } });
      const queue = await dashboard<{ applications: Application[], members: Member[] }>('queue');
      setApplications(queue.applications); setMembers(queue.members);
      setNotice({ kind: 'success', text: status === 'approved' ? item.ign + ' is now approved and listed in the official directory.' : 'Application rejected.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Review failed.' }); }
    finally { setBusy(false); }
  };

  const removeMember = async (member: Member) => {
    if (!window.confirm('Remove ' + (member.ign ?? member.display_name) + ' from the official directory?')) return;
    setBusy(true);
    try {
      await dashboard('remove_member', { body: { member_id: member.id } });
      setMembers(current => current.filter(item => item.id !== member.id));
      setNotice({ kind: 'success', text: 'Member removed from the public directory.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Removal failed.' }); }
    finally { setBusy(false); }
  };

  const updateAdminRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (currentRole !== 'owner') return;
    setBusy(true); setNotice(null);
    try {
      await dashboard('set_role', { body: { email: adminEmail.trim(), role: adminRole } });
      setAdminEmail('');
      setAdminAccounts(await dashboard<AdminAccount[]>('admins'));
      setNotice({ kind: 'success', text: adminRole === 'remove' ? 'Admin access removed.' : 'Admin role saved.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save role.' }); }
    finally { setBusy(false); }
  };

  const transferOwnership = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (currentRole !== 'owner' || !window.confirm('Transfer ownership to ' + transferEmail.trim() + '? You will become a Management Admin and cannot take ownership back yourself.')) return;
    setBusy(true); setNotice(null);
    try {
      await dashboard('transfer', { body: { email: transferEmail.trim() } });
      setCurrentRole('management'); setIsAdmin(true); setAdminAccounts([]); setTransferEmail('');
      setNotice({ kind: 'success', text: 'Ownership transferred. Your account is now a Management Admin.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to transfer ownership.' }); }
    finally { setBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); setNotice({ kind: 'info', text: 'You have signed out.' }); setShowAuth(false); };

  return (
    <div className="site-shell">
      <div className="announcement"><span className="pulse-dot" /> ASYLUM COMMUNITY OFFICIAL DASHBOARD <span className="announcement-right">MAIN PORTAL  /  MEMBERS  /  RECRUITMENT  /  JERSEYS</span></div>
      <header className="topbar">
        <a className="brand" href="#home" onClick={e => { e.preventDefault(); scrollTo('home'); }}>
          <img className="brand-logo" src="/resources/asylum-community-logo.jpg" alt="Asylum Community logo" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className="brand-copy"><strong>Asylum Community</strong><small>Official Main Portal</small></span>
        </a>
        <nav className={mobileOpen ? 'nav-links open' : 'nav-links'}>
          <button onClick={() => { setActiveTab('Members'); scrollTo('directory'); }}>Members</button>
          <button onClick={() => scrollTo('teams')}>Teams</button>
          <button onClick={() => scrollTo('management-showcase')}>Management</button>
          <button onClick={() => scrollTo('achievements')}>Achievements</button>
          <button onClick={() => scrollTo('gallery')}>Gallery</button>
          <button onClick={() => scrollTo('recruitment-intro')}>Recruitment</button>
          <button onClick={() => scrollTo('jersey-intro')}>Jerseys</button>
          {isAdmin && <button onClick={() => scrollTo('manage-community')}>Edit Website</button>}
          {isAdmin && <button onClick={() => scrollTo('admin-panel')}>Applications</button>}
          <button className="nav-cta" onClick={() => { if (session) { setShowAuth(false); scrollTo('account'); } else { setAuthMode('signup'); setShowAuth(true); scrollTo('account'); } }}>
            {session ? 'My account' : 'Member access'} <ArrowUpRight size={15} />
          </button>
        </nav>
        <button className="menu-toggle" aria-label="Toggle navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-grid" /><div className="hero-content">
            <div className="eyebrow"><span className="eyebrow-line" /> THE OFFICIAL ASYLUM COMMUNITY HOME</div>
            <h1>ONE COMMUNITY.<br /><span>EVERY WAY IN.</span></h1>
            <p className="hero-lede">Your starting point for everything ASYLUM. Find verified members, start your recruitment journey, or explore the latest community jersey drop. Different experiences, one official home.</p>
            <div className="hero-actions">
              <button className="button-primary" onClick={() => scrollTo('community-network')}>Explore the community <ArrowRight size={17} /></button>
              <button className="button-quiet" onClick={() => { setActiveTab('Members'); scrollTo('directory'); }}><ShieldCheck size={16} /> Official members</button>
            </div>
            <div className="hero-proof"><span><CheckCircle2 size={15} /> {members.length} approved member profiles</span><span><Fingerprint size={15} /> IGN / UID / SMode lookup</span><span><LockKeyhole size={15} /> Management verified</span></div>
          </div>
          <div className="hero-emblem" aria-label="Asylum Community emblem"><div className="emblem-halo" /><img src="/resources/asylum-community-logo.jpg" alt="Asylum Community red emblem" /><div className="emblem-caption"><span className="caption-dot" /> ASYLUM COMMUNITY <span className="caption-rule" /></div></div>
          <div className="hero-bottom"><span>BUILT FOR THE COMMUNITY</span><span>MEMBERS • RECRUITMENT • JERSEY DROP</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>


        <section className="network-section section-wrap" id="community-network" aria-labelledby="network-title">
          <div className="network-heading">
            <div><div className="section-kicker">01 / THE ASYLUM NETWORK</div><h2 id="network-title">Three ways to <span>belong.</span></h2><p>Discover each part of the community first. You can explore a section here before choosing to visit its official website.</p></div>
            <div className="network-heading-mark"><Orbit size={22} /><span>ASYLUM UNIVERSE / 003</span></div>
          </div>
          <div className="network-grid">
            <button className="network-card network-card-home" type="button" onClick={() => { setActiveTab('Members'); scrollTo('directory'); }}>
              <span className="network-card-top"><span className="network-index">01 / OFFICIAL</span><span className="network-current"><span className="tiny-dot" /> YOU'RE HERE</span></span>
              <span className="network-card-icon"><ShieldCheck size={26} /></span>
              <span className="network-card-title">Official <em>Members</em></span>
              <span className="network-card-description">Verify community members by IGN, UID, or Streamer Mode ID. See management-approved profiles in the official directory.</span>
              <span className="network-card-action">View member directory <ArrowUpRight size={18} /></span>
            </button>
            <button className="network-card network-card-recruitment" type="button" onClick={() => scrollTo('recruitment-intro')}>
              <span className="network-card-top"><span className="network-index">02 / RECRUITMENT</span><span className="network-external"><ExternalLink size={15} /></span></span>
              <span className="network-card-icon"><Swords size={26} /></span>
              <span className="network-card-title">Join the <em>Squad</em></span>
              <span className="network-card-description">Apply to ASYLUM Community through Direct or Referral Application. Follow your recruitment steps on the dedicated site.</span>
              <span className="network-card-action">Discover how to join <ArrowRight size={18} /></span>
            </button>
            <button className="network-card network-card-jersey" type="button" onClick={() => scrollTo('jersey-intro')}>
              <span className="network-card-top"><span className="network-index">03 / OFFICIAL MERCH</span><span className="network-external"><ExternalLink size={15} /></span></span>
              <span className="network-card-icon"><Shirt size={26} /></span>
              <span className="network-card-title">The Jersey <em>Drop</em></span>
              <span className="network-card-description">Explore the official ASYLUM jersey collection. Choose a design and continue to the existing order form.</span>
              <span className="network-card-action">Preview the designs <ArrowRight size={18} /></span>
            </button>
          </div>
          <div className="network-assurance"><Globe2 size={16} /><span>One official community, three connected experiences. Preview the Recruitment and Jersey sections before choosing their dedicated sites.</span></div>
        </section>

        {notice && <div className={'site-notice ' + notice.kind} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss notice"><X size={16} /></button></div>}

        <section className="verify-section section-wrap" id="verify">
          <div className="section-kicker">02 / MEMBER LOOKUP</div>
          <div className="verify-layout">
            <div className="section-intro"><h2>Check the name.<br /><span>Confirm the identity.</span></h2><p>Search approved Asylum members using their IGN, UID, Streamer Mode ID, or team. Applications remain private until management approves them.</p><div className="notice"><ShieldCheck size={18} /><span>The directory displays approved member records only. A missing result alone does not prove an account is fake.</span></div></div>
            <form className="search-card" onSubmit={e => { e.preventDefault(); scrollTo('directory'); }}>
              <label htmlFor="member-search">SEARCH OFFICIAL DIRECTORY</label><div className="search-field"><Search size={19} /><input id="member-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter IGN, UID, or Streamer ID..." /><button type="submit" aria-label="Search directory"><ArrowUpRight size={19} /></button></div>
              <div className="search-meta"><span><span className="tiny-dot" /> Live directory</span><span>IGN / UID / SMODE</span></div>
            </form>
          </div>
        </section>

        <section className="directory-section section-wrap" id="directory">
          <div className="directory-heading"><div><div className="section-kicker">03 / VERIFIED COMMUNITY</div><h2>Our official <span>members.</span></h2></div><div className="preview-label"><span /> {members.length} APPROVED MEMBERS</div></div>
          <div className="tabs" role="tablist" aria-label="Directory categories">
            {[{ name: 'Members', icon: Users }, { name: 'Roles', icon: Crown }].map(({ name, icon: Icon }) => <button key={name} role="tab" aria-selected={activeTab === name} className={activeTab === name ? 'tab active' : 'tab'} onClick={() => setActiveTab(name)}><Icon size={17} /> {name} <span className="tab-arrow">↗</span></button>)}
          </div>
          {activeTab === 'Members' && <div className="member-grid">
            {results.map(member => <article className="member-card" key={member.id}>
              <div className="card-topline">{member.photo_url ? <img className="member-avatar" src={member.photo_url} alt={member.ign ?? member.display_name} /> : <span className="member-icon"><Users size={20} /></span>}<span className="status-pill"><span /> Approved member</span></div>
              <h3>{member.ign || member.display_name}</h3><p className="member-uid">UID: {member.uid || 'Not provided'}</p><div className="member-divider" />
              <div className="member-details"><span>NAME</span><strong>{member.display_name}</strong></div><div className="member-details"><span>SMODE ID</span><strong className={member.streamer_mode_id ? 'streamer-value' : 'streamer-empty'}>{member.streamer_mode_id || 'Not provided'}</strong></div><div className="member-details"><span>TEAM</span><strong>{member.team || 'Community'}</strong></div><div className="member-details"><span>ROLE</span><strong>{member.role || 'Member'}</strong></div>
              {isAdmin && <div className="streamer-editor">
                {editingStreamerFor === member.id ? <div className="streamer-editor-form">
                  <label htmlFor={'streamer-' + member.id}>STREAMER MODE ID</label>
                  <input id={'streamer-' + member.id} type="text" maxLength={100} value={streamerDraft} onChange={e => setStreamerDraft(e.target.value)} placeholder="Leave blank if not applicable" />
                  <div className="streamer-editor-actions">
                    <button className="approve-button" type="button" disabled={busy} onClick={() => void saveStreamerModeId(member)}><Save size={14} /> Save ID</button>
                    <button className="button-quiet" type="button" disabled={busy} onClick={() => setEditingStreamerFor(null)}>Cancel</button>
                  </div>
                </div> : <button className="streamer-edit-button" type="button" disabled={busy} onClick={() => { setEditingStreamerFor(member.id); setStreamerDraft(member.streamer_mode_id || ''); }}><Pencil size={14} /> {member.streamer_mode_id ? 'Edit Streamer ID' : 'Add Streamer ID'}</button>}
              </div>}
              {isAdmin && <button className="danger-link" disabled={busy} onClick={() => void removeMember(member)}>Remove from directory</button>}
              {isAdmin && <label className="photo-upload-control">{member.photo_url ? 'Change profile photo' : 'Upload profile photo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadDirectoryPhoto(member, file); e.currentTarget.value = ''; }} /><small>JPG, PNG or WebP · max 5 MB</small></label>}
              <div className="member-foot"><span><Activity size={14} /> Official record</span><span className="card-arrow"><ArrowUpRight size={17} /></span></div>
            </article>)}
            {results.length === 0 && <div className="empty-state"><Search size={25} /><h3>{query.trim() ? 'No matching members' : 'The roster is waiting'}</h3><p>{query.trim() ? 'Try another IGN, UID, Streamer ID, or team. A missing result does not prove someone is fake.' : 'No approved members are listed yet. Apply to join and management can review your details.'}</p><button onClick={() => { setQuery(''); setAuthMode('signup'); setShowAuth(true); scrollTo('account'); }}>Apply to join</button></div>}
          </div>}
          {activeTab === 'Roles' && <><div className="management-list">{managementRoles.map((item, index) => <article className="management-row" key={item.role}><div className="management-index">0{index + 1}</div><div className="management-icon">{index === 0 ? <Crown /> : index === 1 ? <ShieldCheck /> : <Users />}</div><div className="management-copy"><h3>{item.role}</h3><p>{item.description}</p></div><span className="management-tag">ROLE CATEGORY</span></article>)}</div>{isAdmin && <div className="management-profile-editor"><div className="management-profile-preview">{managementPhotoUrl ? <img src={managementPhotoUrl} alt="Your management profile" /> : <span><Crown size={22} /></span>}<div><strong>Your management profile</strong><small>{session?.user.email} · {currentRole}</small></div></div><label className="photo-upload-control">{managementPhotoUrl ? 'Change your management photo' : 'Upload your management photo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadManagementPhoto(file); e.currentTarget.value = ''; }} /><small>JPG, PNG or WebP · max 5 MB</small></label>{currentRole === 'owner' && adminAccounts.length > 0 && <div className="management-people-list">{adminAccounts.map(account => <div className="management-person" key={account.user_id}>{account.photo_url ? <img src={account.photo_url} alt={account.email || 'Management profile'} /> : <span><Users size={18} /></span>}<div><strong>{account.email || 'Management member'}</strong><small>{account.role}</small></div></div>)}</div>}</div>}</>}
          <div className="directory-disclaimer"><LockKeyhole size={16} /><p>Only approved profiles are displayed here. Management controls member approvals and official directory records.</p></div>
        </section>

        <CommunityShowcase
          members={members}
          isAdmin={isAdmin}
          currentRole={currentRole}
          currentUserId={session?.user.id ?? null}
          onMemberUpdated={updated => setMembers(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))}
        />

        <section className="account-section section-wrap" id="account">
          <div className="section-kicker">10 / MEMBER ACCESS</div><div className="account-layout">
            <div className="section-intro"><h2>Your place in<br /><span>Asylum Community.</span></h2><p>Already part of ASYLUM? Register or sign in to manage your official member profile. New applicants can explore our Recruitment section above.</p><div className="notice"><ShieldCheck size={18} /><span>Your email and account details stay private. Only approved profile information appears in the directory.</span></div></div>
            <div className="account-card">
              {!session || showAuth ? <>
                <div className="account-card-heading"><span className="account-icon">{authMode === 'signup' ? <UserPlus /> : <LogIn />}</span><div><h3>{authMode === 'signup' ? 'Apply for membership' : 'Welcome back'}</h3><p>{authMode === 'signup' ? 'Create an account for management review.' : 'Sign in to check your application.'}</p></div></div>
                <div className="auth-switch"><button className={authMode === 'signup' ? 'selected' : ''} onClick={() => { setAuthMode('signup'); setNotice(null); }}>Register</button><button className={authMode === 'signin' ? 'selected' : ''} onClick={() => { setAuthMode('signin'); setNotice(null); }}>Sign in</button></div>
                <form className="member-form" onSubmit={submitAuth}>
                  {authMode === 'signup' && <>
                    <label htmlFor="display-name">FULL NAME</label><input id="display-name" required minLength={2} maxLength={60} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
                    <label htmlFor="ign">IN-GAME NAME (IGN)</label><input id="ign" required minLength={2} maxLength={40} value={ign} onChange={e => setIgn(e.target.value)} placeholder="Your exact IGN" />
                    <label htmlFor="uid">PLAYER UID</label><input id="uid" required minLength={3} maxLength={40} value={uid} onChange={e => setUid(e.target.value)} placeholder="Your game UID" />
                    <label htmlFor="streamer-mode-id">STREAMER MODE ID <span className="field-hint">Optional · for players using SMode</span></label><input id="streamer-mode-id" maxLength={100} value={streamerModeId} onChange={e => setStreamerModeId(e.target.value)} placeholder="Enter Streamer Mode ID if applicable" />
                    <label htmlFor="profile-photo">PROFILE PICTURE <span className="field-hint">Optional · JPG, PNG or WebP · max 5 MB</span></label><input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
                  </>}
                  <label htmlFor="account-email">EMAIL ADDRESS</label><input id="account-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                  <label htmlFor="account-password">PASSWORD</label><input id="account-password" type="password" required minLength={8} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
                  <button className="button-primary form-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : authMode === 'signup' ? 'Submit application' : 'Sign in'} <ArrowUpRight size={17} /></button>
                </form><p className="privacy-note"><LockKeyhole size={14} /> Never share your password or UID publicly outside the official form.</p>
              </> : <div className="signed-in-panel">
                <span className="account-icon"><CheckCircle2 /></span><h3>You’re signed in</h3><p>{session.user.email}</p>
                {application ? <div className={'application-status ' + application.status}><strong>{application.status.toUpperCase()}</strong><span>{application.status === 'pending' ? 'Management has not reviewed your application yet.' : application.status === 'approved' ? 'Your membership is approved.' : 'Your application was not approved. Contact management if you need clarification.'}</span><div className="application-details"><b>{application.ign}</b><span>UID: {application.uid}</span>{application.streamer_mode_id && <span>Streamer Mode ID: {application.streamer_mode_id}</span>}{application.photo_url && <img src={application.photo_url} alt="Your profile" />}<label className="photo-upload-control">{application.photo_url ? 'Change your profile picture' : 'Add your profile picture'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadOwnMemberPhoto(file); e.currentTarget.value = ''; }} /><small>Upload your own photo · JPG, PNG or WebP · max 5 MB</small></label></div></div> : <><p>No member application is linked to this account yet. If you signed up before registration was enabled, contact management.</p><label className="photo-upload-control">Add your profile picture<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadOwnMemberPhoto(file); e.currentTarget.value = ''; }} /><small>JPG, PNG or WebP · max 5 MB</small></label></>}
                <button className="button-primary form-submit" onClick={() => void signOut()}>Sign out <ArrowUpRight size={17} /></button>{isAdmin && <button className="button-quiet" onClick={() => scrollTo('admin-panel')}>Open management panel</button>}
              </div>}
            </div>
          </div>
        </section>

        {isAdmin && <section className="admin-section section-wrap" id="admin-panel">
          <div className="directory-heading"><div><div className="section-kicker">11 / PRIVATE MANAGEMENT</div><h2>Membership <span>applications.</span></h2></div><div className="preview-label"><span /> ADMIN ACCESS</div></div>
          <p className="admin-intro">Approve an application to publish the member profile in the official directory. Rejected and pending applications stay out of the public roster.</p>
          <div className="application-list">
            {applications.filter(item => item.status === 'pending').map(item => <article className="application-card" key={item.id}>
              {item.photo_url ? <img className="application-avatar" src={item.photo_url} alt={item.ign} /> : <span className="member-icon"><Users size={20} /></span>}
              <div className="application-copy"><h3>{item.ign}</h3><p>{item.display_name} · UID: {item.uid}</p><small>{new Date(item.created_at).toLocaleDateString()}</small></div>
              <div className="application-actions"><button disabled={busy} onClick={() => void reviewApplication(item, 'approved')} className="approve-button"><CheckCircle2 size={15} /> Approve</button><button disabled={busy} onClick={() => void reviewApplication(item, 'rejected')} className="reject-button">Reject</button></div>
            </article>)}
            {applications.filter(item => item.status === 'pending').length === 0 && <div className="empty-state"><CheckCircle2 size={25} /><h3>No pending applications</h3><p>New applications will appear here after members register.</p></div>}
          </div>
          <div className="admin-records"><h3>Recent applications</h3>{applications.slice(0, 8).map(item => <div className="admin-record" key={item.id}><span>{item.ign} <small>· {item.uid}</small></span><span className={'status-text ' + item.status}>{item.status}</span></div>)}</div>
          {currentRole === 'owner' && <div className="owner-tools">
            <div className="section-kicker">OWNER CONTROLS</div><h3>Admin & ownership management</h3><p>Only the current Owner can assign or remove staff roles. The target account must register first.</p>
            <div className="owner-admin-list">{adminAccounts.map(account => <div className="owner-admin-row" key={account.user_id}><div><strong>{account.email || 'Registered account'}</strong><small>{account.user_id}</small></div><span className={'role-chip ' + account.role}>{account.role === 'owner' ? 'Owner' : account.role === 'management' ? 'Management Admin' : 'Moderator'}</span></div>)}</div>
            <form className="owner-form" onSubmit={updateAdminRole}><label htmlFor="admin-email">REGISTERED ACCOUNT EMAIL</label><input id="admin-email" type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="person@example.com" /><label htmlFor="admin-role">ROLE ACTION</label><select id="admin-role" value={adminRole} onChange={e => setAdminRole(e.target.value as 'management' | 'moderator' | 'remove')}><option value="management">Management Admin</option><option value="moderator">Moderator</option><option value="remove">Remove admin access</option></select><button className="button-primary form-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save role'} <ArrowUpRight size={17} /></button></form>
            <form className="owner-form transfer-form" onSubmit={transferOwnership}><label htmlFor="transfer-email">TRANSFER COMMUNITY OWNERSHIP</label><p>The new Owner must already have a registered account. Your account will automatically become a Management Admin after transfer.</p><input id="transfer-email" type="email" required value={transferEmail} onChange={e => setTransferEmail(e.target.value)} placeholder="newowner@example.com" /><button className="transfer-button" type="submit" disabled={busy}>Transfer ownership <Crown size={16} /></button></form>
          </div>}
        </section>}

        <section className="bottom-cta"><div className="cta-mark"><ShieldCheck size={24} /></div><div><div className="section-kicker">BUILT AROUND TRUST</div><h2>Official means <span>confirmed.</span></h2><p>Keep the directory accurate, clear, and managed by authorized people.</p></div><button className="button-primary" onClick={() => { setAuthMode('signup'); setShowAuth(true); scrollTo('account'); }}>Join Asylum <ArrowUpRight size={17} /></button></section>
      </main>
      <footer className="footer"><a className="footer-brand" href="#home" onClick={e => { e.preventDefault(); scrollTo('home'); }}>ASYLUM <span>COMMUNITY</span></a><span>MEMBERS • RECRUITMENT • JERSEY DROP</span><span>© {new Date().getFullYear()} ASYLUM COMMUNITY · OFFICIAL DIRECTORY</span></footer>
    </div>
  );
}

export default App;

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Camera, ChevronRight,
  Crown, Image as ImageIcon, Medal, Pencil, Plus, Save,
  Search, Shield, ShieldCheck, Shirt, Sparkles, Swords, Trash2, Trophy, Upload,
  Users, X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import './community-showcase.css';

export type PortalMember = {
  id: string;
  user_id?: string | null;
  display_name: string;
  ign: string | null;
  uid: string | null;
  streamer_mode_id?: string | null;
  team: string | null;
  role: string;
  photo_url: string | null;
};
type TeamPerson = Pick<PortalMember, 'id' | 'display_name' | 'ign' | 'photo_url' | 'role'>;
type Team = {
  id: string; name: string; description: string; logo_url: string | null;
  captain_member_id: string | null; members: TeamPerson[];
};
type Manager = {
  user_id: string; role: string; display_name: string; ign?: string | null; title: string; bio: string;
  photo_url: string | null; show_public?: boolean;
};
type Achievement = {
  id: string; title: string; subtitle: string; details: string; badge: string;
  image_url: string | null; achieved_on: string | null;
};
type Photo = {
  id: string; title: string; caption: string; category: string; image_url: string;
};
type ShowcaseData = {
  teams: Team[]; management: Manager[]; achievements: Achievement[]; gallery: Photo[];
};
const emptyShowcase: ShowcaseData = { teams: [], management: [], achievements: [], gallery: [] };
const emptyTeam = { id: '', name: '', description: '', logo_url: '', captain_member_id: '', member_ids: [] as string[] };
const emptyMember = { id: '', display_name: '', ign: '', uid: '', streamer_mode_id: '', team: '', role: 'Member' };
const emptyAchievement = { id: '', title: '', subtitle: '', details: '', badge: 'ACHIEVEMENT', image_url: '', achieved_on: '' };
const emptyGallery = { id: '', title: '', caption: '', category: 'COMMUNITY', image_url: '' };
const emptyManager = { user_id: '', display_name: '', title: '', bio: '', photo_url: '', show_public: true };
const displayDesignation = (person: Manager): string => {
  const custom = person.title?.trim();
  if (custom) return custom;
  switch (person.role) {
    case 'owner': return 'Community Owner';
    case 'management': return 'Management Admin';
    case 'moderator': return 'Moderator';
    default: return 'Community Admin';
  }
};

const jerseyDesigns = [
  { name: 'V1 / Shadow', code: '01', image: 'https://asylum-jersey-nu.vercel.app/resources/v1-shadow.png' },
  { name: 'V2 / Ghost', code: '02', image: 'https://asylum-jersey-nu.vercel.app/resources/v2-ghost.png' },
  { name: 'V3 / Reign', code: '03', image: 'https://asylum-jersey-nu.vercel.app/resources/v3-reign.png' },
  { name: 'V4 / Venom', code: '04', image: 'https://asylum-jersey-nu.vercel.app/resources/v4-venom.png' },
];
const openSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const memberName = (m: TeamPerson) => m.ign || m.display_name;
function Initials({ name }: { name: string }) {
  return <span className="asy-photo-fallback" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'ASY'}</span>;
}
async function showApi<T>(action: string, body?: Record<string, unknown>): Promise<T> {
  const token = body ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const res = await fetch('/api/showcase?action=' + encodeURIComponent(action), {
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Unable to load community content.');
  return data.data as T;
}

type Props = {
  members: PortalMember[];
  isAdmin: boolean;
  currentRole: string | null;
  currentUserId: string | null;
  onMemberUpdated: (member: PortalMember) => void;
};
export default function CommunityShowcase({ members, isAdmin, currentRole, currentUserId, onMemberUpdated }: Props) {
  const [content, setContent] = useState<ShowcaseData>(emptyShowcase);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<{ url: string; title: string; caption: string } | null>(null);
  const [galleryFilter, setGalleryFilter] = useState('ALL');
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<'members' | 'teams' | 'management' | 'achievements' | 'gallery'>('teams');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [teamDraft, setTeamDraft] = useState({ ...emptyTeam });
  const [memberDraft, setMemberDraft] = useState({ ...emptyMember });
  const [managerDraft, setManagerDraft] = useState({ ...emptyManager });
  const [staffOptions, setStaffOptions] = useState<Manager[]>([]);
  const [achievementDraft, setAchievementDraft] = useState({ ...emptyAchievement });
  const [galleryDraft, setGalleryDraft] = useState({ ...emptyGallery });
  const [memberFilter, setMemberFilter] = useState('');

  const reload = async () => {
    const result = await showApi<ShowcaseData>('public');
    setContent(result);
  };
  useEffect(() => {
    let active = true;
    showApi<ShowcaseData>('public').then(result => { if (active) setContent(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Community information is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!lightbox) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') setLightbox(null); };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [lightbox]);
  useEffect(() => {
    if (!isAdmin || !studioOpen) return;
    showApi<Manager[]>('staff_list', {}).then(setStaffOptions).catch(() => setStaffOptions([]));
  }, [isAdmin, studioOpen]);

  const categoryOptions = useMemo(() => ['ALL', ...new Set(content.gallery.map(photo => photo.category.toUpperCase()))], [content.gallery]);
  const filteredGallery = content.gallery.filter(photo => galleryFilter === 'ALL' || photo.category.toUpperCase() === galleryFilter);
  const filteredMembers = members.filter(m => !memberFilter.trim() || [m.ign, m.display_name, m.uid].some(value => (value || '').toLowerCase().includes(memberFilter.toLowerCase())));

  const editTeam = (team?: Team) => {
    setStatus('');
    setTeamDraft(team ? {
      id: team.id, name: team.name, description: team.description || '',
      logo_url: team.logo_url || '', captain_member_id: team.captain_member_id || '',
      member_ids: team.members.map(m => m.id),
    } : { ...emptyTeam, member_ids: [] });
  };
  const editMember = (member?: PortalMember) => {
    setStatus('');
    setMemberDraft(member ? {
      id: member.id, display_name: member.display_name, ign: member.ign || '', uid: member.uid || '',
      streamer_mode_id: member.streamer_mode_id || '', team: member.team || '', role: member.role || 'Member',
    } : { ...emptyMember });
  };
  const editManager = (manager?: Manager) => {
    setStatus('');
    setManagerDraft(manager ? {
      user_id: manager.user_id, display_name: manager.display_name || '', title: manager.title || '',
      bio: manager.bio || '', photo_url: manager.photo_url || '', show_public: manager.show_public !== false,
    } : { ...emptyManager });
  };
  const editAchievement = (item?: Achievement) => {
    setStatus('');
    setAchievementDraft(item ? {
      id: item.id, title: item.title, subtitle: item.subtitle || '', details: item.details || '',
      badge: item.badge || 'ACHIEVEMENT', image_url: item.image_url || '', achieved_on: item.achieved_on?.slice(0, 10) || '',
    } : { ...emptyAchievement });
  };
  const editPhoto = (photo?: Photo) => {
    setStatus('');
    setGalleryDraft(photo ? {
      id: photo.id, title: photo.title, caption: photo.caption || '', category: photo.category || 'COMMUNITY', image_url: photo.image_url,
    } : { ...emptyGallery });
  };

  const uploadImage = async (file: File, setter: (url: string) => void) => {
    if (!currentUserId) throw new Error('You must be logged in to upload images.');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
      throw new Error('Select a JPG, PNG or WebP image up to 5 MB.');
    const path = currentUserId + '/showcase/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const { error: uploadError } = await supabase.storage.from('community-photos').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error('Photo upload failed: ' + uploadError.message + '. You can also use an existing HTTPS photo URL.');
    setter(supabase.storage.from('community-photos').getPublicUrl(path).data.publicUrl);
    setStatus('Photo uploaded. Save this form to publish the change.');
  };
  const handleUpload = async (file: File | undefined, setter: (url: string) => void) => {
    if (!file) return;
    setSaving(true); setStatus('');
    try { await uploadImage(file, setter); }
    catch (err) { setStatus(err instanceof Error ? err.message : 'Photo upload failed.'); }
    finally { setSaving(false); }
  };
  const handleSave = async (event: FormEvent<HTMLFormElement>, action: string, body: Record<string, unknown>, reset?: () => void) => {
    event.preventDefault(); setSaving(true); setStatus('');
    try {
      const result = await showApi<PortalMember | { id: string }>(action, body);
      if (action === 'member') onMemberUpdated(result as PortalMember);
      await reload();
      if (action === 'management_save') setStaffOptions(await showApi<Manager[]>('staff_list', {}));
      reset?.();
      setStatus('Saved successfully. The official website has been updated.');
    } catch (err) { setStatus(err instanceof Error ? err.message : 'Unable to save.'); }
    finally { setSaving(false); }
  };
  const handleDelete = async (action: string, id: string, label: string) => {
    if (!window.confirm(`Remove ${label} from the public website? This cannot be undone.`)) return;
    setSaving(true); setStatus('');
    try {
      await showApi(action, { id });
      await reload();
      if (action === 'team_delete') editTeam();
      if (action === 'achievement_delete') editAchievement();
      if (action === 'gallery_delete') editPhoto();
      setStatus('Content removed successfully.');
    } catch (err) { setStatus(err instanceof Error ? err.message : 'Unable to remove content.'); }
    finally { setSaving(false); }
  };

  return <div className="asy-world">
    <section className="asy-feature-section asy-feature-recruit" id="recruitment-intro" aria-labelledby="recruit-title">
      <div className="asy-feature-copy">
        <span className="asy-section-label">02 / BECOME ONE OF US</span>
        <h2 id="recruit-title">YOUR SQUAD.<br /><em>YOUR STORY.</em></h2>
        <p>Passionate about CODM? ASYLUM Community welcomes players who value teamwork, respect, and growth. Find out how recruitment works before submitting your application.</p>
        <div className="asy-feature-steps">
          <span><b>01</b> Check the requirements</span>
          <span><b>02</b> Apply Direct or Referral</span>
          <span><b>03</b> Follow your screening progress</span>
        </div>
        <a className="asy-cta-primary" href="https://asylum-community-recruitment-sigma.vercel.app/" target="_blank" rel="noopener noreferrer">Interested in joining? Apply here <ArrowUpRight size={18} /></a>
        <small className="asy-feature-footnote">You’ll continue to the separate, official Recruitment website.</small>
      </div>
      <div className="asy-recruit-art" aria-label="Asylum recruitment visual">
        <div className="asy-recruit-grid" />
        <div className="asy-recruit-orbit asy-recruit-orbit-one" />
        <div className="asy-recruit-orbit asy-recruit-orbit-two" />
        <div className="asy-recruit-mark"><img src="/resources/asylum-community-logo.jpg" alt="Asylum Community official emblem" /></div>
        <div className="asy-recruit-art-top"><span className="asy-live-dot" /> OFFICIAL RECRUITMENT</div>
        <div className="asy-recruit-art-bottom">YOUR NEXT <strong>CHAPTER</strong> STARTS HERE</div>
      </div>
    </section>

    <section className="asy-feature-section asy-jersey-feature" id="jersey-intro" aria-labelledby="jersey-title">
      <div className="asy-jersey-heading">
        <div><span className="asy-section-label">03 / REPRESENT YOUR COMMUNITY</span><h2 id="jersey-title">WEAR THE <em>ASYLUM.</em></h2>
          <p>Four jersey designs. One community. Preview the collection here, then visit the dedicated Jersey Drop website to explore and order.</p></div>
        <a className="asy-cta-outline" href="https://asylum-jersey-nu.vercel.app/" target="_blank" rel="noopener noreferrer">Go to Jersey Drop <ArrowUpRight size={18} /></a>
      </div>
      <div className="asy-jersey-grid">
        {jerseyDesigns.map(jersey => <button key={jersey.code} type="button" className="asy-jersey-card" onClick={() => setLightbox({ url: jersey.image, title: jersey.name, caption: 'Official ASYLUM Community jersey design · Open the Jersey Drop site to explore the collection.' })}>
          <span className="asy-jersey-card-index">DESIGN / {jersey.code}</span>
          <img src={jersey.image} alt={jersey.name + ' official jersey preview'} loading="lazy" />
          <span className="asy-jersey-card-bottom"><strong>{jersey.name}</strong><span>View design <ArrowUpRight size={15} /></span></span>
        </button>)}
      </div>
      <div className="asy-jersey-foot"><span><Shirt size={17} /> OFFICIAL ASYLUM COMMUNITY COLLECTION</span><a href="https://asylum-jersey-nu.vercel.app/" target="_blank" rel="noopener noreferrer">Explore all designs and order <ArrowRight size={16} /></a></div>
    </section>

    <section className="asy-showcase-section" id="teams" aria-labelledby="asy-teams-title">
      <div className="asy-section-heading">
        <div><span className="asy-section-label">04 / THE SQUADS</span><h2 id="asy-teams-title">BUILT AS <em>ONE.</em></h2><p>Meet the official teams, their captains, and the members who represent ASYLUM Community.</p></div>
        <div className="asy-section-counter"><strong>{content.teams.length.toString().padStart(2, '0')}</strong><span>OFFICIAL TEAMS</span></div>
      </div>
      {loading ? <div className="asy-showcase-empty"><Sparkles size={29} /><p>Loading official teams…</p></div> : content.teams.length === 0 ? <div className="asy-showcase-empty"><Swords size={35} /><h3>Our squads are getting ready.</h3><p>Official team logos, captains, and lineups will appear here once management publishes them.</p>{isAdmin && <button onClick={() => { setStudioTab('teams'); setStudioOpen(true); openSection('manage-community'); }}>Create the first team <Plus size={17} /></button>}</div> :
        <div className="asy-team-showcase-grid">{content.teams.map((team, index) => {
          const captain = team.members.find(m => m.id === team.captain_member_id);
          return <article className="asy-team-showcase-card" key={team.id}>
            <div className="asy-team-header"><span>OFFICIAL SQUAD / {String(index + 1).padStart(2, '0')}</span><ShieldCheck size={17} /></div>
            <div className="asy-team-identity"><div className="asy-team-logo">{team.logo_url ? <img src={team.logo_url} alt={team.name + ' logo'} loading="lazy" /> : <Swords size={35} />}</div><div><h3>{team.name}</h3><p>{team.description || 'Official ASYLUM Community team'}</p></div></div>
            <div className="asy-team-captain"><Crown size={16} /><div><small>TEAM CAPTAIN</small><strong>{captain ? memberName(captain) : 'To be announced'}</strong></div></div>
            <div className="asy-team-roster-head">TEAM LINEUP <span>{team.members.length} members</span></div>
            <div className="asy-team-roster">{team.members.map(m => <div className="asy-roster-person" key={m.id}>
              {m.photo_url ? <img src={m.photo_url} alt={memberName(m)} loading="lazy" /> : <Initials name={memberName(m)} />}
              <span>{memberName(m)}</span>{m.id === team.captain_member_id && <Crown size={13} aria-label="Captain" />}
            </div>)}{team.members.length === 0 && <p>No roster members yet.</p>}</div>
          </article>;
        })}</div>}
    </section>

    <section className="asy-showcase-section asy-management-showcase" id="management-showcase" aria-labelledby="asy-management-title">
      <div className="asy-section-heading"><div><span className="asy-section-label">05 / THE PEOPLE BEHIND ASYLUM</span><h2 id="asy-management-title">MEET THE <em>LEADERS.</em></h2><p>Behind every strong community is a team that makes it happen. Meet the people responsible for guiding, managing, and supporting ASYLUM.</p></div><div className="asy-section-counter"><strong>{content.management.length.toString().padStart(2, '0')}</strong><span>COMMUNITY LEADERS</span></div></div>
      <div className="asy-management-showcase-grid">{content.management.map((person, index) => <article className="asy-leader-card" key={person.user_id}>
        <div className="asy-leader-photo">{person.photo_url ? <img src={person.photo_url} alt={person.display_name} loading="lazy" /> : <Initials name={person.display_name} />}<div className="asy-leader-overlay" /></div>
        <div className="asy-leader-id">ASY / {displayDesignation(person).toUpperCase()} / {String(index + 1).padStart(2, '0')}</div>
        <div className="asy-leader-info"><span><BadgeCheck size={15} /> {displayDesignation(person)}</span><h3>{person.display_name}</h3><div className="asy-leader-ign">IGN: {person.ign || 'Not provided'}</div><p>{person.bio || 'Helping build a stronger, more connected ASYLUM Community.'}</p><div className="asy-leader-foot">{displayDesignation(person).toUpperCase()} <Shield size={16} /></div></div>
      </article>)}
        {!loading && content.management.length === 0 && <div className="asy-showcase-empty"><Crown size={34} /><h3>Management profiles coming soon.</h3><p>Once management publishes their profiles, they’ll appear here.</p></div>}
      </div>
    </section>

    <section className="asy-showcase-section asy-achievements-showcase" id="achievements" aria-labelledby="asy-achievements-title">
      <div className="asy-section-heading"><div><span className="asy-section-label">06 / THE ASYLUM LEGACY</span><h2 id="asy-achievements-title">MOMENTS OF <em>GLORY.</em></h2><p>Every milestone matters. This is where the community celebrates its verified tournament results, accomplishments, and special moments.</p></div><Trophy size={37} className="asy-heading-icon" /></div>
      {content.achievements.length > 0 ? <div className="asy-achievement-grid">{content.achievements.map((award, index) => <article className="asy-achievement-card" key={award.id}>
        {award.image_url ? <div className="asy-achievement-image"><img src={award.image_url} alt={award.title} loading="lazy" /></div> : <div className="asy-achievement-symbol"><Trophy size={35} /></div>}
        <div className="asy-achievement-body"><span><Medal size={14} /> {award.badge || 'ACHIEVEMENT'} / {String(index+1).padStart(2,'0')}</span><h3>{award.title}</h3>{award.subtitle && <strong>{award.subtitle}</strong>}<p>{award.details}</p><small>{award.achieved_on ? new Date(award.achieved_on + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ASYLUM MILESTONE'}</small></div>
      </article>)}</div> : !loading && <div className="asy-showcase-empty asy-achievement-empty"><Medal size={37} /><h3>Our story is still being written.</h3><p>Management can publish official achievements and event milestones here, complete with dates, descriptions, and photos.</p></div>}
    </section>

    <section className="asy-showcase-section asy-gallery-showcase" id="gallery" aria-labelledby="asy-gallery-title">
      <div className="asy-section-heading"><div><span className="asy-section-label">07 / MOMENTS WE SHARE</span><h2 id="asy-gallery-title">INSIDE <em>ASYLUM.</em></h2><p>Events, squad moments, tournaments, and memories—captured by the community and curated by management.</p></div><Camera size={35} className="asy-heading-icon" /></div>
      {content.gallery.length > 0 && <div className="asy-gallery-filters" role="group" aria-label="Filter gallery photos">{categoryOptions.map(category => <button key={category} type="button" className={galleryFilter === category ? 'selected' : ''} onClick={() => setGalleryFilter(category)}>{category}</button>)}</div>}
      {filteredGallery.length > 0 ? <div className="asy-gallery-grid">{filteredGallery.map(photo => <button className="asy-gallery-tile" key={photo.id} onClick={() => setLightbox({ url: photo.image_url, title: photo.title, caption: photo.caption })} type="button" aria-label={'View ' + photo.title}>
        <img src={photo.image_url} alt={photo.title} loading="lazy" /><span className="asy-gallery-gradient" /><span className="asy-gallery-caption"><small>{photo.category}</small><strong>{photo.title}</strong></span><span className="asy-gallery-expand"><ArrowUpRight size={20} /></span>
      </button>)}</div> : !loading && <div className="asy-showcase-empty"><ImageIcon size={36} /><h3>{content.gallery.length ? 'No photos in this category.' : 'The gallery is ready for your moments.'}</h3><p>{content.gallery.length ? 'Try another category.' : 'Add official community photos, event highlights, and group moments through the Management Studio.'}</p></div>}
    </section>

    {error && <p className="asy-showcase-warning" role="status">{error}</p>}
    {isAdmin && <section className="asy-showcase-section asy-studio-section" id="manage-community">
      <div className="asy-studio-launch"><div><span className="asy-section-label">STAFF ONLY / CONTENT CONTROL</span><h2>COMMUNITY <em>STUDIO.</em></h2><p>Edit member information, build teams, publish milestones, and manage official public profiles without touching the database manually.</p></div><button type="button" className="asy-cta-primary" onClick={() => setStudioOpen(v => !v)}>{studioOpen ? 'Close management studio' : 'Open management studio'} <Pencil size={17} /></button></div>
      {studioOpen && <div className="asy-studio-panel">
        <div className="asy-studio-tabs" role="tablist" aria-label="Management studio sections">
          {([{id:'members',label:'Members',icon:Users},{id:'teams',label:'Teams',icon:Swords},{id:'management',label:'Management',icon:Crown},{id:'achievements',label:'Achievements',icon:Trophy},{id:'gallery',label:'Gallery',icon:Camera}] as const).map(({id,label,icon:Icon}) => <button type="button" key={id} role="tab" aria-selected={studioTab===id} className={studioTab===id?'active':''} onClick={() => { setStudioTab(id); setStatus(''); }}><Icon size={16}/>{label}</button>)}
        </div>
        {status && <p className="asy-studio-status" role="status">{status}</p>}
        {studioTab === 'members' && <div className="asy-studio-content"><div className="asy-studio-title"><h3>Edit official member profiles</h3><p>Approved members only. Update display names, IGN, UID, Streamer Mode ID, team label, and roster role.</p></div>
          <div className="asy-studio-columns"><div className="asy-studio-picker"><label htmlFor="asy-member-search">SEARCH MEMBERS</label><div className="asy-studio-search"><Search size={17}/><input id="asy-member-search" value={memberFilter} onChange={e=>setMemberFilter(e.target.value)} placeholder="Search IGN, name, UID" /></div><div className="asy-studio-pick-list">{filteredMembers.map(m => <button type="button" key={m.id} onClick={() => editMember(m)} className={memberDraft.id===m.id?'chosen':''}><span>{m.ign || m.display_name}</span><small>{m.uid || 'No UID'}</small><ChevronRight size={15}/></button>)}{filteredMembers.length===0 && <small>No matching members.</small>}</div></div>
            <form className="asy-studio-form" onSubmit={e=>void handleSave(e,'member',memberDraft)}><h4>{memberDraft.id?'Edit '+memberDraft.ign:'Select a member'}</h4><label>PUBLIC DISPLAY NAME<input required minLength={2} maxLength={60} disabled={!memberDraft.id} value={memberDraft.display_name} onChange={e=>setMemberDraft(d=>({...d,display_name:e.target.value}))}/></label><div className="asy-studio-form-grid"><label>IN-GAME NAME<input required minLength={2} maxLength={40} disabled={!memberDraft.id} value={memberDraft.ign} onChange={e=>setMemberDraft(d=>({...d,ign:e.target.value}))}/></label><label>CODM UID<input required minLength={3} maxLength={40} disabled={!memberDraft.id} value={memberDraft.uid} onChange={e=>setMemberDraft(d=>({...d,uid:e.target.value}))}/></label></div><label>STREAMER MODE ID (REQUIRED FOR NEW REGISTRATIONS)<input maxLength={100} disabled={!memberDraft.id} value={memberDraft.streamer_mode_id} onChange={e=>setMemberDraft(d=>({...d,streamer_mode_id:e.target.value}))} placeholder="Can be added by management" /></label><div className="asy-studio-form-grid"><label>TEAM LABEL<input disabled={!memberDraft.id} maxLength={80} value={memberDraft.team} onChange={e=>setMemberDraft(d=>({...d,team:e.target.value}))} placeholder="e.g. Competitive"/></label><label>PUBLIC ROLE<input disabled={!memberDraft.id} maxLength={80} value={memberDraft.role} onChange={e=>setMemberDraft(d=>({...d,role:e.target.value}))} placeholder="e.g. Player"/></label></div><button className="asy-cta-primary" type="submit" disabled={saving||!memberDraft.id}><Save size={16}/> Save member profile</button></form></div>
        </div>}
        {studioTab === 'teams' && <div className="asy-studio-content"><div className="asy-studio-title"><h3>Manage official squads</h3><p>Create teams, choose captains, upload team logos, and select members who belong to each squad.</p></div>
          <div className="asy-studio-columns"><div className="asy-studio-picker"><button type="button" className="asy-add-button" onClick={()=>editTeam()}><Plus size={17}/> Add new team</button><div className="asy-studio-pick-list">{content.teams.map(t=><button type="button" key={t.id} className={teamDraft.id===t.id?'chosen':''} onClick={()=>editTeam(t)}><span>{t.name}</span><small>{t.members.length} players</small><ChevronRight size={15}/></button>)}</div></div>
            <form className="asy-studio-form" onSubmit={e=>void handleSave(e,'team_save',teamDraft,()=>editTeam())}><h4>{teamDraft.id?'Update team':'New official team'}</h4><label>TEAM NAME<input required minLength={2} maxLength={80} value={teamDraft.name} onChange={e=>setTeamDraft(d=>({...d,name:e.target.value}))} placeholder="e.g. ASYLUM ELITE"/></label><label>TEAM DESCRIPTION<textarea maxLength={400} rows={3} value={teamDraft.description} onChange={e=>setTeamDraft(d=>({...d,description:e.target.value}))} placeholder="Introduce this squad"/></label><label>TEAM LOGO URL<input type="url" value={teamDraft.logo_url} onChange={e=>setTeamDraft(d=>({...d,logo_url:e.target.value}))} placeholder="https://..." /></label><label className="asy-upload-control"><Upload size={16}/> Upload a team logo <input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={e=>void handleUpload(e.target.files?.[0],url=>setTeamDraft(d=>({...d,logo_url:url})))} /></label>{teamDraft.logo_url && <img className="asy-studio-preview" src={teamDraft.logo_url} alt="Team logo preview"/>}<label>TEAM CAPTAIN<select value={teamDraft.captain_member_id} onChange={e=>setTeamDraft(d=>({...d,captain_member_id:e.target.value}))}><option value="">To be announced</option>{members.map(m=><option key={m.id} value={m.id}>{m.ign || m.display_name}</option>)}</select></label><div className="asy-roster-select-title">TEAM MEMBERS <span>{teamDraft.member_ids.length} selected</span></div><div className="asy-roster-select">{members.map(m=><label key={m.id} className={teamDraft.member_ids.includes(m.id)?'picked':''}><input type="checkbox" checked={teamDraft.member_ids.includes(m.id)} onChange={e=>setTeamDraft(d=>({...d,member_ids:e.target.checked?[...d.member_ids,m.id]:d.member_ids.filter(id=>id!==m.id)}))}/><span>{m.ign || m.display_name}</span></label>)}{members.length===0&&<small>No approved members available.</small>}</div><div className="asy-studio-actions"><button type="submit" className="asy-cta-primary" disabled={saving}><Save size={16}/> Save team and roster</button>{!!teamDraft.id && <button type="button" className="asy-delete-button" disabled={saving} onClick={()=>void handleDelete('team_delete',teamDraft.id,teamDraft.name)}><Trash2 size={16}/> Delete team</button>}</div></form></div></div>}
        {studioTab === 'management' && <div className="asy-studio-content"><div className="asy-studio-title"><h3>Present the management team</h3><p>Set each leader's individual public designation (EDITOR, FOUNDER, MANAGEMENT, etc.), name, photo, and introduction. This title appears directly on their public card. Private account emails are never shown in the public showcase.</p></div><div className="asy-studio-columns"><div className="asy-studio-picker"><div className="asy-studio-pick-list">{staffOptions.map(person=><button type="button" key={person.user_id} className={managerDraft.user_id===person.user_id?'chosen':''} onClick={()=>editManager(person)}><span>{person.display_name}</span><small>{person.role.toUpperCase()}</small><ChevronRight size={15}/></button>)}</div></div><form className="asy-studio-form" onSubmit={e=>void handleSave(e,'management_save',managerDraft)}><h4>{managerDraft.user_id?'Edit management profile':'Select a staff member'}</h4><label>PUBLIC NAME<input required disabled={!managerDraft.user_id} maxLength={80} value={managerDraft.display_name} onChange={e=>setManagerDraft(d=>({...d,display_name:e.target.value}))} /></label><label>PUBLIC DESIGNATION / TITLE<input disabled={!managerDraft.user_id} maxLength={80} value={managerDraft.title} onChange={e=>setManagerDraft(d=>({...d,title:e.target.value}))} placeholder="e.g. Editor, Founder, Recruiter, Management" /></label><label>SHORT INTRODUCTION<textarea disabled={!managerDraft.user_id} maxLength={600} rows={3} value={managerDraft.bio} onChange={e=>setManagerDraft(d=>({...d,bio:e.target.value}))} placeholder="A short bio about their role in the community" /></label><label>PROFILE PHOTO URL<input type="url" disabled={!managerDraft.user_id} value={managerDraft.photo_url} onChange={e=>setManagerDraft(d=>({...d,photo_url:e.target.value}))} placeholder="https://..." /></label><label className="asy-upload-control"><Upload size={16}/> Upload management photo <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!managerDraft.user_id||saving} onChange={e=>void handleUpload(e.target.files?.[0],url=>setManagerDraft(d=>({...d,photo_url:url})))} /></label>{managerDraft.photo_url && <img className="asy-studio-preview" src={managerDraft.photo_url} alt="Management profile preview"/>}<label className="asy-public-checkbox"><input type="checkbox" disabled={!managerDraft.user_id} checked={managerDraft.show_public} onChange={e=>setManagerDraft(d=>({...d,show_public:e.target.checked}))}/> Show this staff profile publicly</label><button type="submit" className="asy-cta-primary" disabled={saving||!managerDraft.user_id||(currentRole==='moderator'&&managerDraft.user_id!==currentUserId)}><Save size={16}/> Save management profile</button></form></div></div>}
        {studioTab === 'achievements' && <div className="asy-studio-content"><div className="asy-studio-title"><h3>Publish community achievements</h3><p>Share verified results and milestones. Don't publish unconfirmed achievements.</p></div><div className="asy-studio-columns"><div className="asy-studio-picker"><button type="button" className="asy-add-button" onClick={()=>editAchievement()}><Plus size={17}/> Add achievement</button><div className="asy-studio-pick-list">{content.achievements.map(a=><button key={a.id} type="button" className={achievementDraft.id===a.id?'chosen':''} onClick={()=>editAchievement(a)}><span>{a.title}</span><ChevronRight size={15}/></button>)}</div></div><form className="asy-studio-form" onSubmit={e=>void handleSave(e,'achievement_save',achievementDraft,()=>editAchievement())}><h4>{achievementDraft.id?'Edit achievement':'New achievement'}</h4><label>TITLE<input required minLength={2} maxLength={120} value={achievementDraft.title} onChange={e=>setAchievementDraft(d=>({...d,title:e.target.value}))} placeholder="e.g. Tournament Champions"/></label><label>EVENT / SUBTITLE<input maxLength={120} value={achievementDraft.subtitle} onChange={e=>setAchievementDraft(d=>({...d,subtitle:e.target.value}))} placeholder="Event name"/></label><div className="asy-studio-form-grid"><label>LABEL<input maxLength={50} value={achievementDraft.badge} onChange={e=>setAchievementDraft(d=>({...d,badge:e.target.value}))} placeholder="e.g. CHAMPIONS" /></label><label>DATE<input type="date" value={achievementDraft.achieved_on} onChange={e=>setAchievementDraft(d=>({...d,achieved_on:e.target.value}))}/></label></div><label>DESCRIPTION<textarea rows={3} maxLength={1500} value={achievementDraft.details} onChange={e=>setAchievementDraft(d=>({...d,details:e.target.value}))} placeholder="What did ASYLUM accomplish?"/></label><label>PHOTO URL (OPTIONAL)<input type="url" value={achievementDraft.image_url} onChange={e=>setAchievementDraft(d=>({...d,image_url:e.target.value}))} placeholder="https://..." /></label><label className="asy-upload-control"><Upload size={16}/> Upload achievement photo <input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={e=>void handleUpload(e.target.files?.[0],url=>setAchievementDraft(d=>({...d,image_url:url})))} /></label>{achievementDraft.image_url && <img className="asy-studio-preview" src={achievementDraft.image_url} alt="Achievement preview"/>}<div className="asy-studio-actions"><button type="submit" className="asy-cta-primary" disabled={saving}><Save size={16}/> Publish achievement</button>{!!achievementDraft.id && <button type="button" className="asy-delete-button" disabled={saving} onClick={()=>void handleDelete('achievement_delete',achievementDraft.id,achievementDraft.title)}><Trash2 size={16}/> Remove</button>}</div></form></div></div>}
        {studioTab === 'gallery' && <div className="asy-studio-content"><div className="asy-studio-title"><h3>Curate the Asylum photo gallery</h3><p>Upload community moments, team photos, tournament memories, and event highlights.</p></div><div className="asy-studio-columns"><div className="asy-studio-picker"><button type="button" className="asy-add-button" onClick={()=>editPhoto()}><Plus size={17}/> Add gallery photo</button><div className="asy-studio-pick-list">{content.gallery.map(p=><button type="button" key={p.id} className={galleryDraft.id===p.id?'chosen':''} onClick={()=>editPhoto(p)}><span>{p.title}</span><small>{p.category}</small><ChevronRight size={15}/></button>)}</div></div><form className="asy-studio-form" onSubmit={e=>void handleSave(e,'gallery_save',galleryDraft,()=>editPhoto())}><h4>{galleryDraft.id?'Edit photo':'New gallery photo'}</h4><label>PHOTO TITLE<input required minLength={2} maxLength={120} value={galleryDraft.title} onChange={e=>setGalleryDraft(d=>({...d,title:e.target.value}))} placeholder="e.g. ASYLUM Community Night"/></label><label>CATEGORY<input maxLength={60} value={galleryDraft.category} onChange={e=>setGalleryDraft(d=>({...d,category:e.target.value}))} placeholder="e.g. EVENTS, SQUADS, TOURNAMENTS" /></label><label>CAPTION<textarea rows={3} maxLength={1000} value={galleryDraft.caption} onChange={e=>setGalleryDraft(d=>({...d,caption:e.target.value}))} placeholder="What's happening in this photo?" /></label><label>PHOTO URL<input type="url" required value={galleryDraft.image_url} onChange={e=>setGalleryDraft(d=>({...d,image_url:e.target.value}))} placeholder="https://..." /></label><label className="asy-upload-control"><Upload size={16}/> Upload image from device <input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={e=>void handleUpload(e.target.files?.[0],url=>setGalleryDraft(d=>({...d,image_url:url})))} /></label>{galleryDraft.image_url && <img className="asy-studio-preview" src={galleryDraft.image_url} alt="Gallery image preview"/>}<div className="asy-studio-actions"><button type="submit" className="asy-cta-primary" disabled={saving}><Save size={16}/> Publish gallery photo</button>{!!galleryDraft.id && <button type="button" className="asy-delete-button" disabled={saving} onClick={()=>void handleDelete('gallery_delete',galleryDraft.id,galleryDraft.title)}><Trash2 size={16}/> Remove</button>}</div></form></div></div>}
      </div>}
    </section>}
    {lightbox && <div className="asy-lightbox" role="presentation" onClick={() => setLightbox(null)}><div className="asy-lightbox-inner" role="dialog" aria-modal="true" aria-label={lightbox.title} onClick={e=>e.stopPropagation()}><button type="button" className="asy-lightbox-close" onClick={()=>setLightbox(null)} aria-label="Close photo"><X size={20}/></button><img src={lightbox.url} alt={lightbox.title}/><div><strong>{lightbox.title}</strong><p>{lightbox.caption}</p></div></div></div>}
  </div>;
}
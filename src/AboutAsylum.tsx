import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Compass, Crown, Edit3, Flag, Save, ShieldCheck, Sparkles, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import './portal-upgrade.css';

type About = {
  headline: string;
  description: string;
  mission: string;
  founder: string;
  founded_on: string | null;
  origin: string;
};
const defaults: About = {
  headline: 'More than a squad. One ASYLUM Community.',
  description: 'ASYLUM COMMUNITY brings Call of Duty: Mobile players together to compete, build friendships, and grow through teamwork, respect, and shared experiences.',
  mission: 'One community where every player can find a place, contribute, and make their mark.',
  founder: 'To be announced',
  founded_on: null,
  origin: 'Philippines · CODM community',
};

export default function AboutAsylum({ isAdmin }: {isAdmin: boolean}) {
  const [about, setAbout] = useState<About>(defaults);
  const [draft, setDraft] = useState<About>(defaults);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/showcase?action=public').then(r=>r.ok?r.json():Promise.reject(new Error('Could not load About ASYLUM.')))
      .then(response => { if (active && response?.data?.about) {setAbout(response.data.about);setDraft(response.data.about);} })
      .catch(()=>{});
    return () => {active=false;};
  }, []);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setSaving(true);setNotice('');
    try {
      const { data: {session} }=await supabase.auth.getSession();
      if(!session)throw new Error('Sign in as management first.');
      const r=await fetch('/api/showcase?action=about_save',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(draft)});
      const response=await r.json();
      if(!r.ok)throw new Error(response.error || 'Could not save About ASYLUM.');
      setAbout(response.data);setDraft(response.data);setEditing(false);setNotice('About ASYLUM updated.');
    }catch(e){setNotice(e instanceof Error?e.message:'Could not save about information.');}
    finally{setSaving(false);}
  }
  const founded = about.founded_on ? new Date(about.founded_on.slice(0,10)+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'}):'To be confirmed';
  return <section className="asy-about" id="about-asylum" aria-labelledby="asy-about-title">
    <div className="asy-about-ambient" aria-hidden="true"><span/><span/><span/></div>
    <div className="asy-about-inner">
      <div className="asy-about-story">
        <div className="asy-about-kicker"><Sparkles size={16}/> 02 / THE ASYLUM STORY</div>
        <h2 id="asy-about-title">MORE THAN <em>A CLAN.</em></h2>
        <h3>{about.headline}</h3>
        <p>{about.description}</p>
        <div className="asy-about-vision"><ShieldCheck size={23}/><div><span>OUR MISSION</span><strong>{about.mission}</strong></div></div>
        {isAdmin && <button className="asy-about-edit" type="button" onClick={()=>{setEditing(!editing);setDraft({...about});setNotice('');}}><Edit3 size={16}/> {editing?'Close editor':'Edit About ASYLUM'}</button>}
      </div>
      <div className="asy-about-facts">
        <div className="asy-about-fact"><span><Crown size={22}/> COMMUNITY FOUNDER</span><strong>{about.founder}</strong><small>Officially editable by ASYLUM management</small></div>
        <div className="asy-about-fact"><span><CalendarDays size={22}/> DATE ESTABLISHED</span><strong>{founded}</strong><small>Community founding date</small></div>
        <div className="asy-about-fact"><span><Compass size={22}/> ROOTS & ORIGIN</span><strong>{about.origin}</strong><small>Our beginnings, our community</small></div>
        <div className="asy-about-seal"><Flag size={28}/><span>ASYLUM COMMUNITY</span><strong>ONE COMMUNITY. ONE IDENTITY.</strong></div>
      </div>
    </div>
    {notice && <div className="asy-about-notice" role="status"><CheckCircle2 size={15}/>{notice}</div>}
    {isAdmin&&editing&&<form className="asy-about-form" onSubmit={e=>void save(e)}>
      <div className="asy-about-form-heading"><div><span>MANAGEMENT STUDIO</span><h3>Edit our official story</h3></div><button type="button" aria-label="Close editor" onClick={()=>setEditing(false)}><X size={17}/></button></div>
      <div className="asy-about-form-grid">
        <label>ABOUT HEADLINE<input value={draft.headline} maxLength={120} required minLength={2} onChange={e=>setDraft(d=>({...d,headline:e.target.value}))}/></label>
        <label>FOUNDER / FOUNDERS<input value={draft.founder} maxLength={120} onChange={e=>setDraft(d=>({...d,founder:e.target.value}))}/></label>
        <label>DATE ESTABLISHED<input type="date" value={draft.founded_on?.slice(0,10) || ''} onChange={e=>setDraft(d=>({...d,founded_on:e.target.value || null}))}/></label>
        <label>ORIGIN / LOCATION<input maxLength={160} value={draft.origin} onChange={e=>setDraft(d=>({...d,origin:e.target.value}))}/></label>
        <label className="asy-about-wide">COMMUNITY DESCRIPTION<textarea rows={4} maxLength={1000} value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
        <label className="asy-about-wide">MISSION<textarea rows={3} maxLength={500} value={draft.mission} onChange={e=>setDraft(d=>({...d,mission:e.target.value}))}/></label>
      </div>
      <button type="submit" className="asy-about-save" disabled={saving}><Save size={17}/> {saving?'Saving…':'Publish updated About ASYLUM'} <ArrowRight size={17}/></button>
    </form>}
  </section>;
}
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createAuthClient } from '@neondatabase/auth';
import { ArrowRight, CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import './NeonAuthPreview.css';

/**
 * PREVIEW ONLY. This site intentionally uses a separate Neon AUTH branch.
 * It never makes Supabase requests and never writes official membership data.
 *
 * Set VITE_NEON_AUTH_URL to the preview branch's public Auth URL.
 * The fallback below is for this isolated preview branch only.
 */
const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL ||
  'https://ep-polished-math-ao5yl995.neonauth.c-2.ap-southeast-1.aws.neon.tech/asylum_community/auth';
const auth = createAuthClient(AUTH_URL);
type LoginMode = 'signup' | 'signin';
type User = { id: string; email: string; name?: string | null; emailVerified?: boolean | null };
const readableError = (error: unknown) => error instanceof Error ? error.message : 'Unable to complete the request.';

export default function NeonAuthPreview() {
  const [mode, setMode] = useState<LoginMode>('signup');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    const result = await auth.getSession();
    if (result.error) throw new Error(result.error.message || 'Could not check Neon session.');
    setUser((result.data?.user || null) as User | null);
  };

  useEffect(() => {
    let live = true;
    void auth.getSession().then(({data}) => {
      if (live) setUser((data?.user || null) as User | null);
    }).catch(() => {
      if (live) setNotice('The Neon Auth preview is not reachable. Check the branch service and trusted origins.');
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setNotice(null);
    setPending(true);
    try {
      if (mode === 'signup') {
        if (!name.trim()) throw new Error('Enter your name to create your test account.');
        const result = await auth.signUp.email({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
        });
        if (result.error) throw new Error(result.error.message || 'Neon signup failed.');
        setNotice('Neon preview account created. This is only a test; it does not add or change an official member. Check whether your verification email is required in Neon Auth settings.');
      } else {
        const result = await auth.signIn.email({ email: email.trim().toLowerCase(), password });
        if (result.error) throw new Error(result.error.message || 'Neon sign-in failed.');
        setNotice('Signed in through the Neon preview Auth service, not Supabase.');
      }
      await refresh();
    } catch (error) {
      setNotice(readableError(error));
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    setNotice(null);
    try {
      const result = await auth.signOut();
      if (result.error) throw new Error(result.error.message || 'Unable to sign out.');
      setUser(null);
      setPassword('');
      setNotice('Neon preview session ended.');
    } catch (error) {
      setNotice(readableError(error));
    } finally {
      setPending(false);
    }
  }

  return <main className="n-preview">
    <header className="n-preview-header">
      <img src="/resources/asylum-login-logo.svg" width="66" height="66" alt="ASYLUM logo"/>
      <div><p>ASYLUM COMMUNITY</p><h1>NEON AUTH <span>PREVIEW.</span></h1></div>
    </header>
    <section className="n-preview-content" aria-labelledby="neon-preview-heading">
      <div className="n-preview-intro">
        <div className="n-preview-kicker"><ShieldCheck size={18}/> ISOLATED TEST ENVIRONMENT</div>
        <h2 id="neon-preview-heading">One community.<br/><em>Independent login.</em></h2>
        <p>Testing a new account system hosted on the ASYLUM Official Dashboard's Neon project. This preview never contacts Supabase and cannot alter live member applications, Admin roles, or Recruitment records.</p>
        <div className="n-preview-status"><CheckCircle2 size={18} /> Neon preview branch only · production unchanged</div>
      </div>
      <div className="n-preview-panel">
        {loading ? <p>Checking Neon session…</p> : user ? <>
          <div className="n-preview-icon"><KeyRound size={24}/></div>
          <h3>Neon session active</h3>
          <p>Your test account signed in successfully as:</p>
          <div className="n-preview-user">{user.email}</div>
          <div className="n-preview-state">Email verified: <strong>{user.emailVerified === true ? 'Yes' : 'Not verified / not returned'}</strong></div>
          <p className="n-preview-warning">This preview does not link your Neon test account to any existing Owner or Admin account. Real access will remain blocked until verified identity mapping is implemented and tested.</p>
          <button className="n-preview-submit" type="button" disabled={pending} onClick={() => void signOut()}>Sign out <ArrowRight size={18}/></button>
        </> : <>
          <div className="n-preview-mode"><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Create test account</button><button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Test sign in</button></div>
          <h3>{mode === 'signup' ? 'Try Neon registration' : 'Try Neon login'}</h3>
          <form onSubmit={submit}>
            {mode === 'signup' && <label>Display name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Your display name"/></label>}
            <label>Email<input autoComplete="email" required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"/></label>
            <label>Password<input autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
            <button className="n-preview-submit" type="submit" disabled={pending}>{pending ? 'Working…' : mode === 'signup' ? 'Create preview account' : 'Sign in with Neon'} <ArrowRight size={18}/></button>
          </form>
          <div className="n-preview-safe"><LockKeyhole size={15}/> Only use a test account here. Do not re-enter a production password.</div>
        </>}
        {notice && <p className="n-preview-notice" role="status">{notice}</p>}
      </div>
    </section>
    <footer>NOT THE OFFICIAL LIVE LOGIN · NEON AUTH MIGRATION PREVIEW · NO SUPABASE CONNECTIONS</footer>
  </main>;
}

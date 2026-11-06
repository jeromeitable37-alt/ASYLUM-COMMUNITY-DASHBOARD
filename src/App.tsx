import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity, ArrowUpRight, CheckCircle2, Crown, Fingerprint, UserRoundCog,
  LockKeyhole, Menu, Search, ShieldCheck, Swords, Users, X, Shirt, RefreshCw, ExternalLink, Orbit, ArrowRight, Pencil, Save, Globe2, Eye, EyeOff, Sparkles,
} from 'lucide-react';
import { neonEmailAuth, readVerifiedBrowserSession, requestNeonPasswordResetCode, finishNeonPasswordReset, savePendingRegistration, readPendingRegistration, clearPendingRegistration } from './lib/portal-auth';
import type { PortalSession } from './lib/portal-auth';
import { uploadPortalImage } from './lib/portal-images';
import { readApiEnvelope } from './lib/read-api';
import CommunityShowcase from './CommunityShowcase';
import AboutAsylum from './AboutAsylum';
import UserManagement from './UserManagement';
import PhotoCropper from './PhotoCropper';
import './auth-cyber.css';
import './neon-recovery.css';
import './hero-motion.css';
import CinematicMedia from './CinematicMedia';

type Member = { id: string; user_id?: string | null; display_name: string; ign: string | null; uid: string | null; streamer_mode_id: string | null; team: string | null; role: string; photo_url: string | null };
type Application = { id: string; display_name: string; ign: string; uid: string; streamer_mode_id: string | null; photo_url: string | null; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string };
type Notice = { kind: 'success' | 'error' | 'info'; text: string };
type AdminRole = 'owner' | 'management' | 'moderator' | 'admin';
type AdminAccount = { user_id: string; email: string | null; role: AdminRole; created_at: string; photo_url?: string | null };
type CropTarget = {kind:'member';member:Member;file:File} | {kind:'self'|'management'|'registration';file:File};

const managementRoles = [
  { role: 'Community Owner', description: 'Overall community leadership and final approval.' },
  { role: 'Management', description: 'Member records, team assignments, and community operations.' },
  { role: 'Moderation', description: 'Community safety, reports, and member support.' },
];

async function dashboard<T>(action: string, opts?: { body?: Record<string, unknown> }): Promise<T> {
  // Same-origin session cookies are validated by the Vercel API against Neon Auth.
  const res = await fetch('/api/dashboard?action=' + encodeURIComponent(action), {
    method: opts?.body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: opts?.body ? { 'Content-Type': 'application/json' } : {},
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const output = await readApiEnvelope<T>(res);
  return output.data;
}

function App() {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [dashboardUserId, setDashboardUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Members');
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoBoost, setLogoBoost] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signin');
  const [showAuth, setShowAuth] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState<AdminRole | null>(null);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [managementPhotoUrl, setManagementPhotoUrl] = useState<string | null>(null);
  const [transferEmail, setTransferEmail] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [application, setApplication] = useState<Application | null>(null);
  const [profileLoadState, setProfileLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [profileRefreshVersion, setProfileRefreshVersion] = useState(0);
  const [applications, setApplications] = useState<Application[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<'request' | 'verify' | 'staff' | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [securityNewPassword, setSecurityNewPassword] = useState('');
  const [securityConfirm, setSecurityConfirm] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [emailOtp, setEmailOtp] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [missingFullName, setMissingFullName] = useState('');
  const [missingIgn, setMissingIgn] = useState('');
  const [missingUid, setMissingUid] = useState('');
  const [missingStreamer, setMissingStreamer] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [ign, setIgn] = useState('');
  const [uid, setUid] = useState('');
  const [streamerModeId, setStreamerModeId] = useState('');
  const [myStreamerDraft, setMyStreamerDraft] = useState('');
  const [editingStreamerFor, setEditingStreamerFor] = useState<string | null>(null);
  const [streamerDraft, setStreamerDraft] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let mounted = true;
    // Do not trust a cached SDK session from the previous cross-origin login.
    // Only the server-visible first-party cookie can unlock the Dashboard.
    void readVerifiedBrowserSession()
      .then(verified => {
        if (!mounted) return;
        setSession(verified);
        if (!verified) {
          setAuthMode('signin');
          setShowAuth(true);
          setProfileLoadState('idle');
          setNotice({kind:'info',text:'Sign in to reconnect your existing ASYLUM account. Your Owner role and member records are safe; you do not need to register again.'});
        }
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setAuthMode('signin');
        setShowAuth(true);
        setNotice({kind:'error',text:'Unable to contact the Neon session service. Your account has not been changed.'});
      });
    return () => {mounted = false;};
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (session?.user && active) {
        setProfileLoadState('loading');
        setApplication(null);
      }
      try {
        const directory = await dashboard<Member[]>('directory');
        if (active) setMembers(directory ?? []);
        if (!session?.user) {
          if (active) { setIsAdmin(false); setCurrentRole(null); setAdminAccounts([]); setApplication(null); setApplications([]); setDashboardUserId(null); setProfileLoadState('idle'); }
          return;
        }
        // Check the canonical Neon profile before trying to create an application.
        // Migrated Owner/Admin members must never be forced through signup again.
        let profile = await dashboard<{dashboard_user_id:string, application: Application | null, admin: { role: AdminRole, photo_url: string | null } | null }>('profile');
        const draft = readPendingRegistration();
        if (draft && draft.email.toLowerCase() === session.user.email?.toLowerCase()) {
          if (profile.application || profile.admin) {
            clearPendingRegistration();
          } else {
            try {
              await dashboard('bootstrap', { body: {
                display_name: draft.display_name, ign: draft.ign, uid: draft.uid,
                streamer_mode_id: draft.streamer_mode_id,
              } });
              clearPendingRegistration();
              profile = await dashboard<{dashboard_user_id:string, application: Application | null, admin: { role: AdminRole, photo_url: string | null } | null }>('profile');
            } catch (error) {
              // Profile lookup already succeeded; don't replace it with a
              // false "Profile could not be loaded" when a draft is incomplete.
              if (active) setNotice({kind:'error',text:error instanceof Error ? error.message : 'Unable to submit the saved registration draft.'});
            }
          }
        }
        if (!active) return;
        setDashboardUserId(profile.dashboard_user_id);
        const role = profile.admin?.role ?? null;
        setCurrentRole(role);
        setManagementPhotoUrl(profile.admin?.photo_url ?? null);
        const admin = role === 'owner' || role === 'management' || role === 'admin' || role === 'moderator';
        setIsAdmin(admin);
        setApplication(profile.application);
        setProfileLoadState('ready');
        // Profile is already valid: a secondary management list error must
        // not hide the signed-in Owner account behind a misleading error.
        try {
          if (role === 'owner') {
            const accounts = await dashboard<AdminAccount[]>('admins');
            if (active) setAdminAccounts(accounts ?? []);
          } else if (active) setAdminAccounts([]);
          if (admin) {
            const queue = await dashboard<{ applications: Application[], members: Member[] }>('queue');
            if (active) { setApplications(queue.applications); setMembers(queue.members); }
          } else if (active) setApplications([]);
        } catch (secondaryError) {
          if (active) setNotice({kind:'error',text:'Owner profile verified, but a management panel could not be loaded: ' +
            (secondaryError instanceof Error ? secondaryError.message : 'Please retry later.')});
        }
      } catch (error) {
        if (active) {
          const detail = error instanceof Error ? error.message : 'Could not load dashboard data.';
          if (/first-party Neon login session is missing|Neon did not return an active session|Neon session has expired|Sign in to your verified Neon account|Neon login session is missing/i.test(detail)) {
            setSession(null);
            setDashboardUserId(null);
            setCurrentRole(null);
            setIsAdmin(false);
            setProfileLoadState('idle');
            setAuthMode('signin');
            setShowAuth(true);
            setNotice({ kind: 'info', text: 'Your login session needs reconnecting. Sign in with your existing account; do not register again.' });
          } else {
            if (session?.user) setProfileLoadState('error');
            setNotice({ kind: 'error', text: detail });
          }
        }
      }
    };
    void load();
    return () => { active = false; };
  }, [session?.user?.id, profileRefreshVersion]);

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

  useEffect(() => {
    if (!photoFile) { setPhotoPreviewUrl(null); return; }
    const url=URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  },[photoFile]);

  function choosePhoto(file: File | undefined, kind: CropTarget['kind'], member?: Member) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size < 100 || file.size > 5 * 1024 * 1024) {
      setNotice({kind:'error',text:'Choose a JPG, PNG or WebP picture up to 5 MB.'});
      return;
    }
    setNotice(null);
    if (kind==='member' && member) setCropTarget({kind,member,file});
    else if(kind==='registration'||kind==='management'||kind==='self') setCropTarget({kind,file});
  }

  async function saveCroppedPhoto(file: File) {
    if (!cropTarget) return;
    switch(cropTarget.kind) {
      case 'member': await uploadDirectoryPhoto(cropTarget.member,file); break;
      case 'management': await uploadManagementPhoto(file); break;
      case 'self': await uploadOwnMemberPhoto(file); break;
      case 'registration': setPhotoFile(file); break;
    }
    setCropTarget(null);
  }

  const uploadPhoto = async (_userId: string, file: File) => {
    const publicUrl = await uploadPortalImage(file, 'application');
    await dashboard('photo', { body: { kind: 'application', photo_url: publicUrl } });
  };

  const uploadOwnMemberPhoto = async (file: File) => {
    if (!session?.user) throw new Error('Sign in to update your profile picture.');
    setBusy(true); setNotice(null);
    try {
      const publicUrl = await uploadPortalImage(file, 'self');
      await dashboard('photo', { body: { kind: 'self', photo_url: publicUrl } });
      setApplication(current => current ? { ...current, photo_url: publicUrl } : current);
      setMembers(current => current.map(member => member.user_id === dashboardUserId ? { ...member, photo_url: publicUrl } : member));
      setNotice({ kind: 'success', text: 'Your profile picture has been updated.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save your picture.' }); throw error; }
    finally { setBusy(false); }
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      if (!import.meta.env.VITE_NEON_AUTH_URL)
        throw new Error('Official Neon Auth is not configured for this deployment. Please contact management.');
      const normalizedEmail = email.trim().toLowerCase();
      if (authMode === 'signup') {
        const cleanName = displayName.trim(), cleanIgn = ign.trim(), cleanUid = uid.trim(), cleanStreamerId = streamerModeId.trim();
        if (cleanName.length < 2 || cleanIgn.length < 2 || cleanUid.length < 3)
          throw new Error('Enter your full name, IGN, and CODM UID.');
        if (!cleanStreamerId || cleanStreamerId.length > 100)
          throw new Error('Streamer Mode ID is required (maximum 100 characters).');
        if (photoFile && (!['image/jpeg','image/png','image/webp'].includes(photoFile.type) || photoFile.size > 5*1024*1024))
          throw new Error('Upload a JPG, PNG or WebP image no larger than 5 MB.');
        // Persist only the non-secret application fields while verification
        // occurs. No password or Auth tokens are stored in this draft.
        savePendingRegistration({
          email: normalizedEmail, display_name: cleanName,
          ign: cleanIgn, uid: cleanUid, streamer_mode_id: cleanStreamerId,
        });
        // The Supabase-compatible adapter expects a session immediately after signup.
        // With required Neon verification, a new user has no session yet.
        // Use the native Better Auth signup method, which returns the unverified user.
        const { error } = await neonEmailAuth.signUp.email({
          email: normalizedEmail, password, name: cleanName,
        });
        if (error) throw new Error(error.message || 'Neon signup failed.');
        setPassword('');
        setConfirmationEmail(normalizedEmail);
        setShowAuth(true);
        try {
          const result = await neonEmailAuth.emailOtp.sendVerificationOtp({
            email: normalizedEmail, type: 'email-verification',
          });
          if (result.error) throw new Error(result.error.message || 'Verification code could not be sent.');
          setNotice({kind:'success',text:'Neon account created. Check your email for the six-digit code below. Your application will be saved after verification and sign in.'});
        } catch (sendError) {
          setNotice({kind:'error',text:'Account created, but Neon could not send the verification code: ' +
            (sendError instanceof Error ? sendError.message : 'Email delivery is not ready.') +
            '. Use Resend verification code later. Do not register again.'});
        }
      } else {
        // Neon Auth verifies the password. Before showing "signed in", verify
        // the first-party HTTP-only cookie is visible to our own API server.
        const { error } = await neonEmailAuth.signIn.email({email: normalizedEmail, password});
        if (error) throw new Error(error.message || 'Neon sign-in failed.');
        const verified = await readVerifiedBrowserSession();
        if (!verified?.user?.id || verified.user.email?.toLowerCase() !== normalizedEmail) {
          throw new Error('Neon accepted the sign-in but no first-party session was created. Your account is safe; please contact management if this persists.');
        }
        const currentUser = verified.user;
        // Lookup must precede any registration draft replay. Existing Owner/
        // Admin accounts must not be modified by a stale sign-up draft.
        const profile = await dashboard<{
          application: Application | null;
          admin: { role: AdminRole } | null;
        }>('profile');
        const draft = readPendingRegistration();
        if (draft && draft.email.toLowerCase() === normalizedEmail) {
          if (profile.application || profile.admin) {
            clearPendingRegistration();
          } else {
            await dashboard('bootstrap', {body: {
              display_name: draft.display_name,
              ign: draft.ign,
              uid: draft.uid,
              streamer_mode_id: draft.streamer_mode_id,
            }});
            clearPendingRegistration();
            if (photoFile) {
              await uploadPhoto(currentUser.id, photoFile);
              setPhotoFile(null);
            }
          }
        }
        // Only show authenticated UI after the server has confirmed the
        // canonical Dashboard profile and its authorized account mapping.
        setSession(verified);
        setPassword('');
        setConfirmationEmail(null);
        setShowAuth(false);
        setNotice({kind:'success',text:'Your verified Neon account is connected to the Official Dashboard.'});
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Authentication failed. Please retry.';
      if (authMode === 'signup' && /failed to retrieve user session/i.test(detail)) {
        setConfirmationEmail(email.trim().toLowerCase());
        setPassword('');
        setNotice({kind:'info',text:'Neon may have created your account without a session. Do not register again. Use Resend code and verify the email below.'});
      } else setNotice({kind:'error',text:detail});
    } finally { setBusy(false); }
  };

  const beginPasswordRecovery = () => {
    setAuthMode('signin');
    setRecoveryMode('request');
    setRecoveryEmail(email.trim());
    setRecoveryCode(''); setRecoveryPassword(''); setRecoveryConfirm('');
    setPassword('');
    setNotice(null);
  };

  const beginStaffActivation = () => {
    setAuthMode('signup');
    setRecoveryMode('staff');
    setRecoveryEmail(email.trim());
    setRecoveryPassword('');
    setRecoveryConfirm('');
    setRecoveryCode('');
    setConfirmationEmail(null);
    setNotice(null);
  };

  const activateExistingStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recoveryBusy) return;
    const address = recoveryEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setNotice({kind:'error',text:'Enter your existing ASYLUM staff email.'});
      return;
    }
    if (recoveryPassword.length < 8 || recoveryConfirm !== recoveryPassword) {
      setNotice({kind:'error',text:'Set a password with at least 8 characters and confirm it.'});
      return;
    }
    setRecoveryBusy(true);
    setNotice(null);
    try {
      // Creates only a Neon Auth credential; no membership application, staff
      // role or Dashboard identity is created or modified here.
      const {error} = await neonEmailAuth.signUp.email({
        email:address,password:recoveryPassword,name:'ASYLUM Staff',
      });
      if (error) throw new Error('Activation could not be completed. If this login already exists, use Verify email or Reset password instead.');
      setRecoveryPassword('');setRecoveryConfirm('');
      setRecoveryMode(null);setAuthMode('signin');
      setConfirmationEmail(address);setEmail(address);
      try {
        const sent = await neonEmailAuth.emailOtp.sendVerificationOtp({
          email:address,type:'email-verification',
        });
        if (sent.error) throw new Error('Email delivery failed.');
        setNotice({kind:'info',text:'Your Neon login was created. A verification code was requested; check Inbox/Spam for Neon Auth mail. After verification, the Owner must link it to your existing staff role. No new member application was made.'});
      } catch {
        setNotice({kind:'error',text:'Your Neon login was created, but the verification email could not be confirmed. Use Resend code after email delivery is configured. Do not create another account.'});
      }
    } catch {
      setNotice({kind:'error',text:'Unable to activate this Neon login. Existing users should use Verify email / Reset password; if you are an existing staff member, ask the Owner to check your activation status.'});
    } finally {setRecoveryBusy(false);}
  };

  const requestPasswordResetCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recoveryBusy) return;
    const address = recoveryEmail.trim().toLowerCase();
    if (!address.includes('@')) {
      setNotice({kind:'error',text:'Enter your Neon Auth account email.'});
      return;
    }
    setRecoveryBusy(true); setNotice(null);
    try {
      await requestNeonPasswordResetCode(address);
      setRecoveryEmail(address);
      setRecoveryMode('verify');
      setNotice({kind:'info',text:'If this email already has a Neon Auth login, a reset code may arrive. Check Inbox and Spam for mail from Neon Auth. Existing staff without a Neon login must activate it first; resetting a password cannot create the account.'});
    } catch (error) {
      // Never expose whether the address belongs to another user.
      setNotice({kind:'error',text:error instanceof Error && /origin/i.test(error.message)
        ? 'This Official Dashboard address must be authorized in Neon Auth. Contact management.'
        : 'Unable to request a reset code right now. Check Neon email delivery and try again later.'});
    } finally { setRecoveryBusy(false); }
  };

  const finishPasswordRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recoveryBusy) return;
    if (!/^\d{6,8}$/.test(recoveryCode.trim())) {
      setNotice({kind:'error',text:'Enter the numeric reset code sent to your email.'});
      return;
    }
    if (recoveryPassword.length < 8 || recoveryPassword !== recoveryConfirm) {
      setNotice({kind:'error',text:'Use a password of at least 8 characters and confirm it correctly.'});
      return;
    }
    setRecoveryBusy(true); setNotice(null);
    try {
      await finishNeonPasswordReset(recoveryEmail.trim().toLowerCase(), recoveryCode.trim(), recoveryPassword);
      setRecoveryMode(null);
      setEmail(recoveryEmail.trim().toLowerCase());
      setRecoveryCode('');setRecoveryPassword('');setRecoveryConfirm('');
      setNotice({kind:'success',text:'Your Neon Auth password has been changed. Sign in with the new password.'});
    } catch (error) {
      setNotice({kind:'error',text:error instanceof Error ? error.message : 'The reset code could not be verified. Request a new code.'});
    } finally {setRecoveryBusy(false);}
  };

  const updateMyPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (securityBusy) return;
    if (securityNewPassword.length < 8 || securityNewPassword !== securityConfirm) {
      setNotice({kind:'error',text:'Your new password must be at least 8 characters and match the confirmation.'});
      return;
    }
    setSecurityBusy(true);setNotice(null);
    try {
      const result = await neonEmailAuth.changePassword({
        currentPassword,newPassword:securityNewPassword,revokeOtherSessions:true,
      });
      if (result.error) throw new Error(result.error.message || 'Password change was not successful.');
      setCurrentPassword('');setSecurityNewPassword('');setSecurityConfirm('');
      setSecurityOpen(false);
      setNotice({kind:'success',text:'Your Neon Auth password was updated. Other sessions were signed out.'});
    } catch (error) {
      setNotice({kind:'error',text:error instanceof Error ? error.message : 'Unable to change your password.'});
    } finally {setSecurityBusy(false);}
  };

  const resumeEmailVerification = async () => {
    if (resendBusy) return;
    const address = (recoveryMode === 'request' ? recoveryEmail : email).trim().toLowerCase();
    if (!address || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setNotice({kind:'error',text:'Enter the email address you used to register.'});
      return;
    }
    setRecoveryMode(null);
    setAuthMode('signin');
    setConfirmationEmail(address);
    setPassword('');
    setNotice(null);
    setResendBusy(true);
    try {
      const {error} = await neonEmailAuth.emailOtp.sendVerificationOtp({
        email:address, type:'email-verification',
      });
      if (error) throw new Error(error.message || 'Could not request verification code.');
      setNotice({kind:'info',text:'If your Neon account still needs verification, a code has been requested. Check your Inbox or Spam. Do not create another account.'});
    } catch (error) {
      setNotice({kind:'error',text:error instanceof Error ? error.message : 'Unable to request a verification code.'});
    } finally {setResendBusy(false);}
  };

  const resendConfirmation = async () => {
    if (!confirmationEmail || resendBusy) return;
    setResendBusy(true); setNotice(null);
    try {
      const {error} = await neonEmailAuth.emailOtp.sendVerificationOtp({
        email:confirmationEmail,type:'email-verification',
      });
      if (error) throw error;
      setNotice({kind:'success',text:'Verification code requested from Neon Auth. Check your email, then enter the code below.'});
    } catch(error) {
      setNotice({kind:'error',text:error instanceof Error ? error.message : 'Could not resend code. Try again later.'});
    } finally { setResendBusy(false); }
  };

  const confirmVerification = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmationEmail || !/^\d{6,8}$/.test(emailOtp.trim())) {
      setNotice({kind:'error',text:'Enter the verification code from your email.'});
      return;
    }
    setVerifyBusy(true);setNotice(null);
    try {
      const {error} = await neonEmailAuth.emailOtp.verifyEmail({
        email:confirmationEmail,otp:emailOtp.trim(),
      });
      if (error) throw error;
      setEmailOtp(''); setConfirmationEmail(null); setAuthMode('signin');
      setNotice({kind:'success',text:'Email verified with Neon Auth. Sign in to finish your membership application. You do not need to register again.'});
    } catch(error) {
      setNotice({kind:'error',text:error instanceof Error ? error.message : 'Unable to verify code.'});
    } finally {setVerifyBusy(false);}
  };

  const completeApplication = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();setBusy(true);setNotice(null);
    try {
      await dashboard('bootstrap',{body:{
        display_name:missingFullName.trim(),ign:missingIgn.trim(),
        uid:missingUid.trim(),streamer_mode_id:missingStreamer.trim(),
      }});
      const profile=await dashboard<{application:Application|null}>('profile');
      setApplication(profile.application);
      setNotice({kind:'success',text:'Your official ASYLUM application is now submitted for management review.'});
    } catch(error) {
      setNotice({kind:'error',text:error instanceof Error ? error.message : 'Could not complete your profile.'});
    } finally{setBusy(false);}
  };

  const saveOwnStreamerId = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = myStreamerDraft.trim();
    if (!value || value.length > 100) {
      setNotice({ kind: 'error', text: 'Enter your Streamer Mode ID (maximum 100 characters).' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const updated = await dashboard<Application>('set_my_streamer_id', { body: { streamer_mode_id: value } });
      setApplication(updated);
      setMembers(current => current.map(member => member.user_id === dashboardUserId
        ? { ...member, streamer_mode_id: value } : member));
      setMyStreamerDraft('');
      setNotice({ kind: 'success', text: updated.status === 'pending'
        ? 'Streamer Mode ID saved. Your application is ready for management review.'
        : 'Your Streamer Mode ID has been saved to your official profile.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save your Streamer Mode ID.' });
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
      const publicUrl = await uploadPortalImage(file, 'member');
      await dashboard('photo', { body: { kind: 'member', member_id: member.id, photo_url: publicUrl } });
      setMembers(current => current.map(item => item.id === member.id ? { ...item, photo_url: publicUrl } : item));
      setNotice({ kind: 'success', text: 'Profile picture updated.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to upload picture.' }); throw error; }
    finally { setBusy(false); }
  };

  const uploadManagementPhoto = async (file: File) => {
    if (!session?.user || !currentRole) throw new Error('Sign in as management first.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Use a JPG, PNG, or WebP under 5 MB.');
    setBusy(true); setNotice(null);
    try {
      const publicUrl = await uploadPortalImage(file, 'management');
      await dashboard('photo', { body: { kind: 'admin', photo_url: publicUrl } });
      setManagementPhotoUrl(publicUrl);
      setNotice({ kind: 'success', text: 'Management profile picture saved.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save photo.' }); throw error; }
    finally { setBusy(false); }
  };

  const refreshApplications = async () => {
    const queue = await dashboard<{ applications: Application[], members: Member[] }>('queue');
    setApplications(queue.applications);
    setMembers(queue.members);
  };
  useEffect(() => {
    if (!session?.user?.id || !isAdmin) return;
    const recheck = () => {
      if (document.visibilityState === 'visible') {
        void refreshApplications().catch(() => {/* The visible Refresh button offers a retry. */});
      }
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [session?.user?.id, isAdmin]);

  const reviewApplication = async (item: Application, status: 'approved' | 'rejected') => {
    setBusy(true); setNotice(null);
    try {
      await dashboard('review', { body: { id: item.id, status } });
      await refreshApplications();
      setNotice({ kind: 'success', text: status === 'approved' ? item.ign + ' is now approved and listed in the official directory.' : 'Application rejected.' });
    } catch (error) {
      // A different manager may have already reviewed this application.
      void refreshApplications().catch(() => {});
      setNotice({kind:'error',text:error instanceof Error?error.message:'Review failed.'});
    } finally { setBusy(false); }
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

  const migrateLegacyPhotos = async () => {
    if (currentRole !== 'owner' || busy) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch('/api/migrate-images', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execute: true }),
      });
      const result = await readApiEnvelope<{ migrated:number; failed:number }>(response);
      setNotice({ kind: result.data.failed ? 'info' : 'success',
        text: 'Moved ' + result.data.migrated + ' public images to Neon Storage. ' +
          result.data.failed + ' still need review. Original public files were not deleted.' });
      setProfileRefreshVersion(v => v+1);
    } catch (error) {
      setNotice({kind:'error',text:error instanceof Error ? error.message : 'Unable to transfer public images.'});
    } finally { setBusy(false); }
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

  const signOut = async () => { await neonEmailAuth.signOut(); setSession(null); setDashboardUserId(null); setNotice({ kind: 'info', text: 'You have signed out of Neon Auth.' }); setShowAuth(false); };

  return (
    <div className="site-shell">
      <div className="announcement"><span className="pulse-dot" /> ASYLUM COMMUNITY / OFFICIAL MAIN PORTAL <span className="announcement-right">MAIN PORTAL  /  MEMBERS  /  RECRUITMENT  /  JERSEYS</span></div>
      <header className="topbar">
        <a className="brand" href="#home" onClick={e => { e.preventDefault(); scrollTo('home'); }}>
          <img className="brand-logo" src="/resources/asylum-community-logo.jpg" alt="Asylum Community logo" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className="brand-copy"><strong>Asylum Community</strong><small>Official Main Portal</small></span>
        </a>
        <nav className={mobileOpen ? 'nav-links open' : 'nav-links'}>
          <button onClick={() => { setActiveTab('Members'); scrollTo('directory'); }}>Members</button>
          <button onClick={() => scrollTo('teams')}>Teams</button>
          <button onClick={() => scrollTo('about-asylum')}>About</button>
          <button onClick={() => scrollTo('cinematic')}>CODM Cinema</button>
          <button onClick={() => scrollTo('management-showcase')}>Management</button>
          <button onClick={() => scrollTo('achievements')}>Achievements</button>
          <button onClick={() => scrollTo('gallery')}>Gallery</button>
          <button onClick={() => scrollTo('recruitment-intro')}>Recruitment</button>
          <button onClick={() => scrollTo('jersey-intro')}>Jerseys</button>
          {(currentRole === 'owner' || currentRole === 'management' || currentRole === 'admin') && <button onClick={() => scrollTo('user-management')}>Users</button>}
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
          <button className={'hero-emblem' + (logoBoost ? ' is-boosted' : '')} type="button"
            aria-label="Toggle the Asylum Community logo energy effect" aria-pressed={logoBoost}
            onClick={() => setLogoBoost(value => !value)}
            onPointerMove={event => {
              if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = (event.clientX - rect.left) / rect.width - 0.5;
              const y = (event.clientY - rect.top) / rect.height - 0.5;
              event.currentTarget.style.setProperty('--hero-tilt-y', (x * 13).toFixed(2) + 'deg');
              event.currentTarget.style.setProperty('--hero-tilt-x', (-y * 10).toFixed(2) + 'deg');
            }}
            onPointerLeave={event => {
              event.currentTarget.style.setProperty('--hero-tilt-y', '0deg');
              event.currentTarget.style.setProperty('--hero-tilt-x', '0deg');
            }}>
            <span className="emblem-orbit" aria-hidden="true" />
            <span className="emblem-orbit emblem-orbit-two" aria-hidden="true" />
            <span className="emblem-orbit emblem-orbit-three" aria-hidden="true" />
            <span className="emblem-halo" aria-hidden="true" />
            <span className="emblem-core"><img src="/resources/asylum-community-logo.jpg" alt="Asylum Community red emblem" /></span>
            <span className="emblem-scanline" aria-hidden="true" />
            <span className="emblem-caption"><span className="caption-dot" /> ASYLUM COMMUNITY <span className="caption-rule" /></span>
            <span className="emblem-boost-hint">{logoBoost ? 'CORE BOOST / ACTIVE · CLICK TO RESET' : 'INTERACTIVE EMBLEM · CLICK TO CHARGE'}</span>
          </button>
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

        <CinematicMedia />

        <AboutAsylum isAdmin={isAdmin} />

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
                  <input id={'streamer-' + member.id} type="text" required maxLength={100} value={streamerDraft} onChange={e => setStreamerDraft(e.target.value)} placeholder="Enter the member's required Streamer Mode ID" />
                  <div className="streamer-editor-actions">
                    <button className="approve-button" type="button" disabled={busy} onClick={() => void saveStreamerModeId(member)}><Save size={14} /> Save ID</button>
                    <button className="button-quiet" type="button" disabled={busy} onClick={() => setEditingStreamerFor(null)}>Cancel</button>
                  </div>
                </div> : <button className="streamer-edit-button" type="button" disabled={busy} onClick={() => { setEditingStreamerFor(member.id); setStreamerDraft(member.streamer_mode_id || ''); }}><Pencil size={14} /> {member.streamer_mode_id ? 'Edit Streamer ID' : 'Add Streamer ID'}</button>}
              </div>}
              {isAdmin && <button className="danger-link" disabled={busy} onClick={() => void removeMember(member)}>Remove from directory</button>}
              {isAdmin && <label className="photo-upload-control">{member.photo_url ? 'Change profile photo' : 'Upload profile photo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) choosePhoto(file,'member',member); e.currentTarget.value = ''; }} /><small>JPG, PNG or WebP · max 5 MB</small></label>}
              <div className="member-foot"><span><Activity size={14} /> Official record</span><span className="card-arrow"><ArrowUpRight size={17} /></span></div>
            </article>)}
            {results.length === 0 && <div className="empty-state"><Search size={25} /><h3>{query.trim() ? 'No matching members' : 'The roster is waiting'}</h3><p>{query.trim() ? 'Try another IGN, UID, Streamer ID, or team. A missing result does not prove someone is fake.' : 'No approved members are listed yet. Apply to join and management can review your details.'}</p><button onClick={() => { setQuery(''); setAuthMode('signup'); setShowAuth(true); scrollTo('account'); }}>Apply to join</button></div>}
          </div>}
          {activeTab === 'Roles' && <><div className="management-list">{managementRoles.map((item, index) => <article className="management-row" key={item.role}><div className="management-index">0{index + 1}</div><div className="management-icon">{index === 0 ? <Crown /> : index === 1 ? <ShieldCheck /> : <Users />}</div><div className="management-copy"><h3>{item.role}</h3><p>{item.description}</p></div><span className="management-tag">ROLE CATEGORY</span></article>)}</div>{isAdmin && <div className="management-profile-editor"><div className="management-profile-preview">{managementPhotoUrl ? <img src={managementPhotoUrl} alt="Your management profile" /> : <span><Crown size={22} /></span>}<div><strong>Your management profile</strong><small>{session?.user.email} · {currentRole}</small></div></div><label className="photo-upload-control">{managementPhotoUrl ? 'Change your management photo' : 'Upload your management photo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) choosePhoto(file,'management'); e.currentTarget.value = ''; }} /><small>JPG, PNG or WebP · max 5 MB</small></label>{currentRole === 'owner' && adminAccounts.length > 0 && <div className="management-people-list">{adminAccounts.map(account => <div className="management-person" key={account.user_id}>{account.photo_url ? <img src={account.photo_url} alt={account.email || 'Management profile'} /> : <span><Users size={18} /></span>}<div><strong>{account.email || 'Management member'}</strong><small>{account.role}</small></div></div>)}</div>}</div>}</>}
          <div className="directory-disclaimer"><LockKeyhole size={16} /><p>Only approved profiles are displayed here. Management controls member approvals and official directory records.</p></div>
        </section>

        <CommunityShowcase
          members={members}
          isAdmin={isAdmin}
          currentRole={currentRole}
          currentUserId={dashboardUserId}
          onMemberUpdated={updated => setMembers(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))}
        />

        <section className="account-section section-wrap" id="account">
          <div className="section-kicker">10 / MEMBER ACCESS</div><div className="account-layout">
            <div className="section-intro"><h2>Your place in<br /><span>Asylum Community.</span></h2><p>Already part of ASYLUM? Register or sign in to manage your official member profile. New applicants can explore our Recruitment section above.</p><div className="notice"><ShieldCheck size={18} /><span>Your email and account details stay private. Only approved profile information appears in the directory.</span></div></div>
            <div className="account-card cyber-account-card">
              <div className="auth-mood-particles" aria-hidden="true"><span /><span /><span /><span /><span /></div>
              {!session || showAuth ? <>
                <div className="auth-overline"><Sparkles size={13} /> SECURE ASYLUM ACCESS / 2026</div>
                <div className="account-card-heading"><span className="account-icon account-logo-box"><img className="account-logo-img" src="/resources/asylum-login-logo.svg" alt="Asylum Community official logo" width={56} height={56} /></span><div><h3>{recoveryMode === 'staff' ? 'Register your staff login.' : recoveryMode ? 'Recover your Neon account.' : authMode === 'signup' ? 'Become part of ASYLUM' : 'Welcome back, player.'}</h3><p>{recoveryMode === 'staff' ? 'Use your existing Management/Admin email. Your current role stays unchanged.' : recoveryMode ? 'Reset your password using a code delivered to your registered email.' : authMode === 'signup' ? 'Create your official community profile for management review.' : 'Enter the official community dashboard.'}</p></div></div>
                <div className="auth-switch"><button type="button" className={authMode === 'signup' && !recoveryMode ? 'selected' : ''} onClick={() => { setAuthMode('signup'); setRecoveryMode(null); setNotice(null); }}>Register</button><button type="button" className={authMode === 'signin' && !recoveryMode ? 'selected' : ''} onClick={() => { setAuthMode('signin'); setRecoveryMode(null); setNotice(null); }}>Sign in</button></div>
                {!recoveryMode && confirmationEmail && <section className="asy-confirm-email asy-auth-step" aria-labelledby="asy-verify-email-heading">
                  <div className="asy-auth-step-heading">
                    <span className="asy-auth-step-symbol"><ShieldCheck size={21}/></span>
                    <div>
                      <span className="asy-auth-step-eyebrow">ACCOUNT VERIFICATION</span>
                      <h4 id="asy-verify-email-heading">Check your email</h4>
                      <p className="asy-auth-step-description">Enter the verification code to activate your ASYLUM account.</p>
                    </div>
                  </div>
                  <div className="asy-auth-email-address"><span>Code sent to</span><strong>{confirmationEmail}</strong></div>
                  <form onSubmit={confirmVerification} className="asy-neon-otp-form asy-auth-step-form">
                    <div className="asy-auth-field">
                      <label htmlFor="neon-email-code">Verification code</label>
                      <input id="neon-email-code" className="asy-auth-otp-input" type="text" inputMode="numeric" pattern="[0-9]{6,8}"
                        required minLength={6} maxLength={8} autoComplete="one-time-code" placeholder="000000"
                        aria-describedby="neon-email-code-help" value={emailOtp}
                        onChange={e=>setEmailOtp(e.target.value.replace(/[^0-9]/g,'').slice(0,8))}/>
                      <small id="neon-email-code-help" className="asy-auth-field-help">Enter the 6–8 digit code from your email. Check Spam if needed.</small>
                    </div>
                    <button className="button-primary form-submit asy-auth-action" type="submit" disabled={verifyBusy}>
                      {verifyBusy ? 'Verifying email…' : 'Verify email'} <ArrowRight size={16} />
                    </button>
                  </form>
                  <div className="asy-confirm-actions asy-auth-secondary-actions">
                    <button type="button" disabled={resendBusy} onClick={() => void resendConfirmation()}>{resendBusy ? 'Requesting…' : 'Resend code'}</button>
                    <button type="button" onClick={() => { setAuthMode('signin'); setConfirmationEmail(null); setNotice(null); }}>Back to sign in</button>
                  </div>
                </section>}
                {authMode === 'signup' && !recoveryMode && !confirmationEmail &&
                  <button type="button" className="asy-recovery-link" onClick={beginStaffActivation}>
                    <UserRoundCog size={15} /> Existing Management/Admin? Register staff login
                  </button>}
                {!recoveryMode && !confirmationEmail && <form className="member-form" onSubmit={submitAuth}>
                  {authMode === 'signup' && <>
                    <label htmlFor="display-name">FULL NAME</label><input id="display-name" required minLength={2} maxLength={60} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
                    <label htmlFor="ign">IN-GAME NAME (IGN)</label><input id="ign" required minLength={2} maxLength={40} value={ign} onChange={e => setIgn(e.target.value)} placeholder="Your exact IGN" />
                    <label htmlFor="uid">PLAYER UID</label><input id="uid" required minLength={3} maxLength={40} value={uid} onChange={e => setUid(e.target.value)} placeholder="Your game UID" />
                    <label htmlFor="streamer-mode-id">STREAMER MODE ID <span className="field-hint">REQUIRED</span></label><input id="streamer-mode-id" type="text" required maxLength={100} value={streamerModeId} onChange={e => setStreamerModeId(e.target.value)} placeholder="Enter your actual Streamer Mode ID" autoComplete="off" aria-describedby="streamer-mode-help" /><small id="streamer-mode-help" className="asy-streamer-required-note">Mandatory for new registrations. Your ID is saved with your application.</small>
                    <label htmlFor="profile-photo">PROFILE PICTURE <span className="field-hint">Optional · JPG, PNG or WebP · max 5 MB</span></label><input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {choosePhoto(e.target.files?.[0],'registration');e.currentTarget.value='';}} />
                     {photoFile && <div className="asy-crop-selection-preview">
                       {photoPreviewUrl && <img src={photoPreviewUrl} alt="Cropped registration photo preview"/>}
                       <span>Photo cropped and ready.</span>
                       <button type="button" className="button-quiet" onClick={()=>setPhotoFile(null)}>Remove</button>
                     </div>}
                  </>}
                  <div className="auth-floating-field"><input id="account-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder=" " /><label htmlFor="account-email">EMAIL ADDRESS</label></div>
                  <div className="auth-password-wrap">
                    <div className="auth-floating-field"><input id="account-password" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder=" " /><label htmlFor="account-password">PASSWORD</label></div>
                    <button className="auth-password-toggle" type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button>
                  </div>
                  {notice?.kind === 'error' && <div className="auth-error-inline" role="alert"><X size={14} /> {notice.text}</div>}
                  <button className="button-primary form-submit auth-neon-submit" type="submit" disabled={busy}>{busy ? 'Securing your session…' : authMode === 'signup' ? 'Create ASYLUM profile' : 'Access community'} <ArrowUpRight size={17} /></button>
                </form>}
                {authMode === 'signin' && !recoveryMode && !confirmationEmail &&
                  <button type="button" className="asy-recovery-link" onClick={beginPasswordRecovery}>
                    <LockKeyhole size={15} /> Change password
                  </button>}
                {recoveryMode && <div className="asy-recovery-panel asy-auth-step">
                  {recoveryMode === 'request'
                    ? <form className="asy-recovery-form asy-auth-step-form" onSubmit={requestPasswordResetCode}>
                        <div className="asy-auth-step-heading">
                          <span className="asy-auth-step-symbol"><LockKeyhole size={21}/></span>
                          <div>
                            <span className="asy-auth-step-eyebrow">ACCOUNT RECOVERY</span>
                            <h4>Reset your Neon password</h4>
                            <p className="asy-auth-step-description">Use your registered ASYLUM email to request a verification code.</p>
                          </div>
                        </div>
                        <div className="asy-auth-field">
                          <label htmlFor="recovery-email">Registered email</label>
                          <input id="recovery-email" type="email" autoComplete="email" required maxLength={256}
                            value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)}
                            placeholder="name@example.com"/>
                          <small className="asy-auth-field-help">Use the same registered email. Management/Admin staff without Neon Auth activation should contact the Owner first.</small>
                        </div>
                        <button type="submit" className="button-primary form-submit asy-auth-action" disabled={recoveryBusy}>
                          {recoveryBusy ? 'Requesting code…' : 'Send verification code'} <ArrowRight size={17}/>
                        </button>
                        <button type="button" className="asy-recovery-link" disabled={resendBusy}
                          onClick={() => void resumeEmailVerification()}>
                          <ShieldCheck size={15}/> Verify email instead
                        </button>
                      </form>
                    : recoveryMode === 'staff'
                    ? <form className="asy-recovery-form asy-auth-step-form" onSubmit={activateExistingStaff}>
                        <div className="asy-auth-step-heading">
                          <span className="asy-auth-step-symbol"><ShieldCheck size={21}/></span>
                          <div>
                            <span className="asy-auth-step-eyebrow">MANAGEMENT / ADMIN RE-REGISTRATION</span>
                            <h4>Re-register your staff login</h4>
                            <p className="asy-auth-step-description">For existing Management/Admin only. Use your original registered email and create a new Neon login. Your existing Dashboard role will remain preserved, and this will not submit a new member application.</p>
                          </div>
                        </div>
                        <div className="asy-auth-field">
                          <label htmlFor="staff-activate-email">Existing registered email</label>
                          <input id="staff-activate-email" type="email" required autoComplete="email"
                            value={recoveryEmail} onChange={event=>setRecoveryEmail(event.target.value)}
                            placeholder="name@example.com"/>
                        </div>
                        <div className="asy-auth-field">
                          <label htmlFor="staff-activate-password">New Neon password</label>
                          <input id="staff-activate-password" type="password" required minLength={8}
                            autoComplete="new-password" value={recoveryPassword}
                            onChange={event=>setRecoveryPassword(event.target.value)}
                            placeholder="At least 8 characters"/>
                        </div>
                        <div className="asy-auth-field">
                          <label htmlFor="staff-activate-confirm">Confirm password</label>
                          <input id="staff-activate-confirm" type="password" required minLength={8}
                            autoComplete="new-password" value={recoveryConfirm}
                            onChange={event=>setRecoveryConfirm(event.target.value)}
                            placeholder="Repeat your new password"/>
                        </div>
                        <button className="button-primary form-submit asy-auth-action" type="submit" disabled={recoveryBusy}>
                          {recoveryBusy ? 'Registering…' : 'Register my staff login'} <ArrowRight size={17}/>
                        </button>
                        <small className="asy-auth-field-help">Verify your email afterward. Owner approval is required to link your existing role.</small>
                      </form>
                    : <form className="asy-recovery-form asy-auth-step-form" onSubmit={finishPasswordRecovery}>
                        <div className="asy-auth-step-heading">
                          <span className="asy-auth-step-symbol"><ShieldCheck size={21}/></span>
                          <div>
                            <span className="asy-auth-step-eyebrow">PASSWORD RECOVERY</span>
                            <h4>Set a new password</h4>
                            <p className="asy-auth-step-description">Enter the code from your email, then create your new password.</p>
                          </div>
                        </div>
                        <div className="asy-auth-email-address"><span>Code sent to</span><strong>{recoveryEmail}</strong></div>
                        <div className="asy-auth-field">
                          <label htmlFor="recovery-code">Verification code</label>
                          <input id="recovery-code" className="asy-auth-otp-input" type="text" inputMode="numeric"
                            pattern="[0-9]{6,8}" minLength={6} maxLength={8} required autoComplete="one-time-code"
                            aria-describedby="recovery-code-help" value={recoveryCode}
                            onChange={event=>setRecoveryCode(event.target.value.replace(/[^0-9]/g,'').slice(0,8))}
                            placeholder="000000"/>
                          <small id="recovery-code-help" className="asy-auth-field-help">Enter the 6–8 digit code from your Neon verification email.</small>
                        </div>
                        <div className="asy-auth-field">
                          <label htmlFor="recovery-new">New password</label>
                          <input id="recovery-new" type="password" required minLength={8}
                            autoComplete="new-password" value={recoveryPassword}
                            onChange={event=>setRecoveryPassword(event.target.value)}
                            placeholder="At least 8 characters"/>
                        </div>
                        <div className="asy-auth-field">
                          <label htmlFor="recovery-confirm">Confirm new password</label>
                          <input id="recovery-confirm" type="password" required minLength={8}
                            autoComplete="new-password" value={recoveryConfirm}
                            onChange={event=>setRecoveryConfirm(event.target.value)}
                            placeholder="Repeat your new password"/>
                        </div>
                        <button type="submit" className="button-primary form-submit asy-auth-action" disabled={recoveryBusy}>
                          {recoveryBusy ? 'Saving password…' : 'Save new password'} <ShieldCheck size={17}/>
                        </button>
                        <button type="button" className="asy-recovery-link asy-auth-text-link" onClick={()=> {
                          setRecoveryMode('request'); setRecoveryCode('');setRecoveryPassword('');setRecoveryConfirm(''); setNotice(null);
                        }}>Need another code? Change email or resend</button>
                      </form>}
                  {notice && <p className={notice.kind === 'error' ? 'asy-recovery-error' : 'asy-recovery-info'} role="status">{notice.text}</p>}
                  <button type="button" className="asy-recovery-back asy-auth-text-link" onClick={() => {
                    setRecoveryMode(null);setRecoveryCode('');setRecoveryPassword('');setRecoveryConfirm('');setAuthMode('signin');setNotice(null);
                  }}>Back to sign in</button>
                </div>}
                <p className="privacy-note"><LockKeyhole size={14} /> Never share your password or UID publicly outside the official form.</p>
              </> : <div className="signed-in-panel">
                <span className="account-icon"><CheckCircle2 /></span><h3>You’re signed in</h3><p>{session.user.email}</p>
                {profileLoadState === 'loading' && <div className="asy-complete-streamer-form" role="status">
                  <div className="asy-complete-streamer-label"><ShieldCheck size={17}/> Checking your existing membership</div>
                  <p>Connecting your verified Neon account to your official ASYLUM profile. Please do not submit another application.</p>
                </div>}
                {profileLoadState === 'error' && <div className="asy-complete-streamer-form" role="alert">
                  <div className="asy-complete-streamer-label"><ShieldCheck size={17}/> Your dashboard profile could not be loaded</div>
                  <p>If you're already approved or part of management, do not register again. The original account stays in Neon even if this request fails.</p>
                  {notice?.kind === 'error' && <p className="asy-recovery-error">Details: {notice.text}</p>}
                  <button type="button" className="button-primary form-submit" onClick={() => {setNotice(null);setProfileRefreshVersion(v => v + 1);}}>Retry loading my account <ArrowRight size={16}/></button>
                </div>}
                {profileLoadState === 'ready' && !application && !currentRole && <form className="asy-complete-streamer-form" onSubmit={completeApplication}>
                  <div className="asy-complete-streamer-label"><Fingerprint size={17}/> Complete your ASYLUM registration</div>
                  <p>You're signed in with Neon Auth. Fill in the required community details to submit your application for management review. Existing approved memberships remain linked after verified account migration.</p>
                  <label htmlFor="missing-full-name">FULL NAME</label>
                  <input id="missing-full-name" required minLength={2} maxLength={60} value={missingFullName} onChange={e=>setMissingFullName(e.target.value)} placeholder="Your full name"/>
                  <label htmlFor="missing-ign">IN-GAME NAME (IGN)</label>
                  <input id="missing-ign" required minLength={2} maxLength={40} value={missingIgn} onChange={e=>setMissingIgn(e.target.value)} placeholder="Your CODM IGN"/>
                  <label htmlFor="missing-uid">PLAYER UID</label>
                  <input id="missing-uid" required minLength={3} maxLength={40} value={missingUid} onChange={e=>setMissingUid(e.target.value)} placeholder="Your game UID"/>
                  <label htmlFor="missing-streamer">STREAMER MODE ID — REQUIRED</label>
                  <input id="missing-streamer" required maxLength={100} value={missingStreamer} onChange={e=>setMissingStreamer(e.target.value)} placeholder="Your actual Streamer Mode ID"/>
                  <button type="submit" className="button-primary form-submit" disabled={busy}>
                    <Save size={16}/>{busy ? 'Saving…' : 'Submit Official Application'}
                  </button>
                </form>}
                {application && !application.streamer_mode_id && <form className="asy-complete-streamer-form" onSubmit={saveOwnStreamerId}>
                  <div className="asy-complete-streamer-label"><Fingerprint size={17} /> Complete your required Streamer Mode ID</div>
                  <p>{application
                    ? 'Your existing membership profile is missing this field. Add it below without creating another account.'
                    : 'Finish your existing registration by adding your Streamer Mode ID. We will submit your application for review using your saved signup details.'}</p>
                  <label htmlFor="my-streamer-mode">STREAMER MODE ID <span>REQUIRED</span></label>
                  <input id="my-streamer-mode" type="text" required maxLength={100} autoComplete="off"
                    placeholder="Enter your actual Streamer Mode ID"
                    value={myStreamerDraft} onChange={e => setMyStreamerDraft(e.target.value)} />
                  <button type="submit" disabled={busy} className="button-primary form-submit">
                    <Save size={16} /> {busy ? 'Saving…' : 'Save Streamer Mode ID'}
                  </button>
                </form>}
                {application ? <div className={'application-status ' + application.status}><strong>{application.status.toUpperCase()}</strong><span>{application.status === 'pending' ? 'Management has not reviewed your application yet.' : application.status === 'approved' ? 'Your membership is approved.' : 'Your application was not approved. Contact management if you need clarification.'}</span><div className="application-details"><b>{application.ign}</b><span>UID: {application.uid}</span>{application.streamer_mode_id && <span>Streamer Mode ID: {application.streamer_mode_id}</span>}{application.photo_url && <img src={application.photo_url} alt="Your profile" />}<label className="photo-upload-control">{application.photo_url ? 'Change your profile picture' : 'Add your profile picture'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) choosePhoto(file,'self'); e.currentTarget.value = ''; }} /><small>Upload your own photo · JPG, PNG or WebP · max 5 MB</small></label></div></div> : profileLoadState === 'ready' && !currentRole ? <><p>No application was found for this new Dashboard account. Existing approved members should contact management instead of registering again.</p><label className="photo-upload-control">Add your profile picture<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) choosePhoto(file,'self'); e.currentTarget.value = ''; }} /><small>JPG, PNG or WebP · max 5 MB</small></label></> : null}

                {session && <div className="asy-password-security">
                  <button className="asy-recovery-link" type="button" onClick={() => {setSecurityOpen(v=>!v);setNotice(null);}} aria-expanded={securityOpen}><LockKeyhole size={16}/> {securityOpen ? 'Close password settings' : 'Change my password'}</button>
                  {securityOpen && <form className="asy-recovery-form" onSubmit={updateMyPassword}>
                    <h4>Update Neon Auth password</h4>
                    <p>For security, enter your current password. Other signed-in sessions will be revoked.</p>
                    <label htmlFor="security-old">CURRENT PASSWORD</label>
                    <input id="security-old" type="password" required autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/>
                    <label htmlFor="security-new">NEW PASSWORD</label>
                    <input id="security-new" type="password" minLength={8} required autoComplete="new-password" value={securityNewPassword} onChange={e=>setSecurityNewPassword(e.target.value)}/>
                    <label htmlFor="security-confirm">CONFIRM NEW PASSWORD</label>
                    <input id="security-confirm" type="password" minLength={8} required autoComplete="new-password" value={securityConfirm} onChange={e=>setSecurityConfirm(e.target.value)}/>
                    <button className="button-primary form-submit" type="submit" disabled={securityBusy}>{securityBusy ? 'Updating…' : 'Change password'} <ShieldCheck size={16}/></button>
                  </form>}
                </div>}
                {session && <p className="asy-neon-privacy-note">Neon Auth manages account security for this Dashboard. Recruitment and Jersey accounts are separate.</p>}
                <button className="button-primary form-submit" onClick={() => void signOut()}>Sign out <ArrowUpRight size={17} /></button>{isAdmin && <button className="button-quiet" onClick={() => scrollTo('admin-panel')}>Open management panel</button>}
              </div>}
            </div>
          </div>
        </section>

        {isAdmin && <section className="admin-section section-wrap" id="admin-panel">
          <div className="directory-heading"><div><div className="section-kicker">11 / PRIVATE MANAGEMENT</div><h2>Membership <span>applications.</span></h2></div><div className="preview-label"><span /> ADMIN ACCESS</div></div>
          <p className="admin-intro">Approve new member applications to publish profiles in the directory. Existing staff login access is separate from member approval.</p>
          <button type="button" className="button-quiet" disabled={busy}
            onClick={() => void refreshApplications().then(() => setNotice({kind:'success',text:'Applications refreshed from Neon.'})).catch(error=>setNotice({kind:'error',text:error instanceof Error?error.message:'Unable to refresh applications.'}))}>
            <RefreshCw size={15}/> Refresh applications
          </button>
          <div className="application-list">
            {applications.filter(item => item.status === 'pending').map(item => <article className="application-card" key={item.id}>
              {item.photo_url ? <img className="application-avatar" src={item.photo_url} alt={item.ign} /> : <span className="member-icon"><Users size={20} /></span>}
              <div className="application-copy"><h3>{item.ign}</h3><p>{item.display_name} · UID: {item.uid}</p><small>{new Date(item.created_at).toLocaleDateString()}</small></div>
              <div className="application-actions"><button disabled={busy} onClick={() => void reviewApplication(item, 'approved')} className="approve-button"><CheckCircle2 size={15} /> Approve</button><button disabled={busy} onClick={() => void reviewApplication(item, 'rejected')} className="reject-button">Reject</button></div>
            </article>)}
            {applications.filter(item => item.status === 'pending').length === 0 && <div className="empty-state"><CheckCircle2 size={25} /><h3>No pending applications</h3><p>New applications will appear here after members register.</p></div>}
          </div>
          <div className="admin-records"><h3>Recent applications</h3>{applications.slice(0, 8).map(item => <div className="admin-record" key={item.id}><span>{item.ign} <small>· {item.uid}</small></span><span className={'status-text ' + item.status}>{item.status}</span></div>)}</div>
          {(currentRole === 'owner' || currentRole === 'management' || currentRole === 'admin') && <div className="owner-tools">
            <UserManagement currentUserId={dashboardUserId} onRoleUpdated={() => { void dashboard<AdminAccount[]>('admins').then(setAdminAccounts).catch(() => {}); }} />
            {currentRole === 'owner' && <>
            <div className="owner-form">
              <h3>Transfer existing profile photos to Neon Storage</h3>
              <p>Copies only public ASYLUM images to Neon Main, updates official Neon records and leaves the old shared storage untouched.</p>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void migrateLegacyPhotos()}>
                {busy ? 'Transferring…' : 'Move public ASYLUM photos to Neon'}
              </button>
            </div>
            <form className="owner-form transfer-form" onSubmit={transferOwnership}><label htmlFor="transfer-email">TRANSFER COMMUNITY OWNERSHIP</label><p>The new Owner must already have a registered account. Your account will automatically become a Management Admin after transfer.</p><input id="transfer-email" type="email" required value={transferEmail} onChange={e => setTransferEmail(e.target.value)} placeholder="newowner@example.com" /><button className="transfer-button" type="submit" disabled={busy}>Transfer ownership <Crown size={16} /></button></form>
            </>}
          </div>}
        </section>}

        <section className="bottom-cta"><div className="cta-mark"><ShieldCheck size={24} /></div><div><div className="section-kicker">BUILT AROUND TRUST</div><h2>Official means <span>confirmed.</span></h2><p>Keep the directory accurate, clear, and managed by authorized people.</p></div><button className="button-primary" onClick={() => { setAuthMode('signup'); setShowAuth(true); scrollTo('account'); }}>Join Asylum <ArrowUpRight size={17} /></button></section>
      </main>
      {cropTarget && <PhotoCropper key={cropTarget.file.name + cropTarget.file.lastModified}
        file={cropTarget.file}
        title={cropTarget.kind==='member' ? 'Adjust '+(cropTarget.member.ign||cropTarget.member.display_name)+'’s photo'
          : cropTarget.kind==='management'?'Adjust management photo'
          : cropTarget.kind==='registration'?'Adjust registration photo':'Adjust your profile photo'}
        onSave={saveCroppedPhoto} onCancel={()=>setCropTarget(null)}/>}
      <footer className="footer"><a className="footer-brand" href="#home" onClick={e => { e.preventDefault(); scrollTo('home'); }}>ASYLUM <span>COMMUNITY</span></a><span>MEMBERS • RECRUITMENT • JERSEY DROP</span><span>© {new Date().getFullYear()} ASYLUM COMMUNITY · OFFICIAL DIRECTORY</span></footer>
    </div>
  );
}

export default App;

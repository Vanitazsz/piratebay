import { useState, type FormEvent } from 'react'
import { BadgeCheck, CheckCircle2, ChevronRight, Crown, LockKeyhole, ShieldCheck, UserRound, X } from 'lucide-react'
import type { AuthState } from '../hooks/useAuthSession'
import { friendlyError } from '../lib/supabase'

type Props = { auth: AuthState; onClose: () => void }

export default function AccountModal({ auth, onClose }: Props) {
  const [mode, setMode] = useState<'upgrade' | 'verify'>('upgrade')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSuccess(null); setBusy(true)
    try {
      if (mode === 'upgrade') {
        if (!verificationSent) {
          await auth.startAccountClaim(email.trim())
          setVerificationSent(true)
          setSuccess('A one-time code is on its way. Verify your email to attach it to this guest account.')
        } else {
          await auth.finishAccountClaim(email.trim(), token.trim(), password)
          setSuccess('Email confirmed. Your PirateBay account is now a member, with this guest history preserved.')
        }
      } else {
        if (!verificationSent) {
          await auth.sendVerification(email.trim())
          setVerificationSent(true)
          setSuccess('A one-time verification code is on its way to your .edu.ph inbox.')
        } else {
          await auth.confirmVerification(email.trim(), token.trim())
          setSuccess('Your student email is confirmed. Your verified badge is active.')
        }
      }
      window.setTimeout(() => void auth.refreshProfile(), 1800)
    } catch (cause) { setError(friendlyError(cause)) }
    finally { setBusy(false) }
  }

  async function googleLink() {
    setError(null); setSuccess(null); setBusy(true)
    try {
      await auth.linkGoogle()
      setSuccess('Connecting your Google account…')
    } catch (cause) { setError(friendlyError(cause)) }
    finally { setBusy(false) }
  }

  const verified = auth.profile.trust_tier === 'verified_student'
  const member = auth.profile.trust_tier !== 'guest'

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><div className="eyebrow">Your PirateBay ID</div><h2 id="account-title" style={{ marginTop: 8 }}>{verified ? 'You’re verified.' : member ? 'Your account, your history.' : 'Keep your campus story.'}</h2><p>Move from guest to member whenever you’re ready.</p></div><button className="close-button" onClick={onClose} aria-label="Close"><X size={15} /></button></div>

      <div className="account-badge">
        <span className="avatar"><UserRound size={17} /></span>
        <span style={{ minWidth: 0, flex: 1 }}><span className="account-name" style={{ display: 'block' }}>{auth.profile.alias}</span><span className="account-tier" style={{ display: 'block', marginTop: 4 }}>{auth.profile.selected_school} · {verified ? <span className="verified-text">Verified student</span> : member ? 'Member' : 'Guest'}</span></span>
        {verified ? <span className="pill gold"><BadgeCheck size={12} /> Verified</span> : <span className="pill">{member ? 'Member' : 'Guest'}</span>}
      </div>

      <div className="tier-progress">
        <div className={`tier-step ${!member ? 'current' : ''}`}>01 · Guest</div>
        <div className={`tier-step ${member && !verified ? 'current' : ''}`}>02 · Member</div>
        <div className={`tier-step ${verified ? 'gold-current' : ''}`}>03 · Verified</div>
      </div>

      <label className="form-label" style={{ marginBottom: 14 }}>Your campus
        <select className="form-select" value={auth.profile.selected_school} onChange={(event) => void auth.setSelectedSchool(event.target.value).catch((cause) => setError(friendlyError(cause)))}>
          <option>LPU-Cavite</option><option>DLSU-D</option><option>CavSU</option><option>General / Other</option>
        </select>
      </label>

      {!verified && <>
        <div className="form-grid" style={{ marginBottom: 13 }}>
          <button type="button" className={`secondary-button ${mode === 'upgrade' ? 'active' : ''}`} style={mode === 'upgrade' ? { borderColor: '#883b45', color: '#e59299' } : {}} onClick={() => { setMode('upgrade'); setError(null); setSuccess(null); setVerificationSent(false); setToken('') }}><Crown size={14} />Become a member</button>
          <button type="button" className={`secondary-button ${mode === 'verify' ? 'active' : ''}`} style={mode === 'verify' ? { borderColor: '#883b45', color: '#e59299' } : {}} onClick={() => { setMode('verify'); setError(null); setSuccess(null); setVerificationSent(false); setToken('') }}><BadgeCheck size={14} />Verify student</button>
        </div>

        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="form-label">{mode === 'verify' ? 'School email (.edu.ph)' : 'Email address'}
            <input className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={mode === 'verify' ? 'you@lpunetwork.edu.ph' : 'you@example.com'} required readOnly={verificationSent} />
          </label>
          {mode === 'upgrade' && <label className="form-label">Create a password
            <input className="form-input" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required readOnly={false} />
          </label>}
          {verificationSent && <label className="form-label">One-time code<input className="form-input" inputMode="numeric" autoComplete="one-time-code" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Enter the code from your email" required /></label>}
          {mode === 'verify' && <p className="privacy-note" style={{ margin: 0 }}><LockKeyhole size={12} />We only use your school address to confirm your student badge.</p>}
          {error && <div className="error-note">{error}</div>}
          {success && <div className="success-note"><CheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />{success}</div>}
          {!auth.connected && <div className="error-note">Preview mode is active. Add Supabase keys to enable account linking and student email checks.</div>}
          <button className="primary-button" disabled={busy || !auth.connected}>
            {busy ? 'Sending…' : mode === 'verify' ? verificationSent ? 'Verify my .edu.ph email' : 'Send verification code' : verificationSent ? 'Verify email & claim account' : 'Send account confirmation'}<ChevronRight size={14} />
          </button>
          {mode === 'upgrade' && <><div className="divider" style={{ margin: '3px 0', position: 'relative' }} /><span className="muted tiny" style={{ textAlign: 'center', marginTop: -20, background: 'var(--surface)', justifySelf: 'center', padding: '0 8px' }}>or</span><button type="button" className="secondary-button" disabled={busy || !auth.connected} onClick={() => void googleLink()}><b style={{ font: '700 13px Arial', color: '#4285f4' }}>G</b>Continue with Google</button></>}
        </form>
      </>}

      {verified && <div className="success-note"><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Your verified student badge is active for {auth.profile.verified_domain ?? 'your school domain'}.</div>}
      {auth.error && <p className="muted tiny" style={{ margin: '12px 0 0' }}>Session note: {auth.error}</p>}
    </section>
  </div>
}

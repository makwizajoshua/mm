import { useState, type FormEvent } from 'react'
import { api, type SessionData } from '../api'
import { errorMessage } from '../utils'
import type { Notice } from '../types'
import { Icon } from './common'

export function AuthScreen({ onSignedIn, sessionData, onDismissToken, notice, onNotice, onDismissNotice }: { onSignedIn: (session: SessionData) => Promise<void>; sessionData: SessionData | null; onDismissToken: () => void; notice: Notice | null; onNotice: (message: string, kind?: Notice['kind']) => void; onDismissNotice: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login')
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCurrency, setCompanyCurrency] = useState('MWK')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetHint, setResetHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setLocalError('')
    try {
      if (mode === 'login') await onSignedIn(await api.login(identifier, password))
      else if (mode === 'register') await onSignedIn(await api.register(username, email, password, companyName, companyCurrency))
      else if (mode === 'forgot') {
        const response = await api.request<{ message: string; resetToken?: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
        setResetHint(response.message)
        if (response.resetToken) setResetToken(response.resetToken)
      } else {
        await api.request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) })
        setMode('login')
        setPassword('')
        setResetToken('')
        onNotice('Password reset. Sign in with your new password.')
      }
    } catch (err) { setLocalError(errorMessage(err)) } finally { setBusy(false) }
  }

  return <div className="auth-screen">
    <div className="auth-left"><div className="brand-lockup"><span className="brand-mark">M</span><span>market<span className="brand-light">mesh</span></span></div><div className="auth-story"><span className="story-kicker"><span className="status-dot" />COMMERCE, CONNECTED</span><h1>Everything your operation needs. <em>All in one place.</em></h1><p>Bring your products, stores, orders, and people together in a single workspace built for momentum.</p><div className="story-stats"><div><b>One</b><span>connected workspace</span></div><div><b>Every</b><span>part of your operation</span></div></div></div><div className="auth-copyright">© {new Date().getFullYear()} MarketMesh <span>·</span> Operations workspace</div></div>
    <div className="auth-right"><div className="auth-form-wrap">
      <div className="auth-mobile-brand brand-lockup"><span className="brand-mark">M</span><span>market<span className="brand-light">mesh</span></span></div>
      <span className="eyebrow">MARKETMESH WORKSPACE</span>
      <h2>{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your workspace account' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2>
      <p className="auth-subtitle">{mode === 'login' ? 'Enter your details to access your workspace.' : mode === 'register' ? 'Get started with your operations workspace.' : mode === 'forgot' ? 'We’ll help you get back into your account.' : 'Enter the reset token and your new password.'}</p>
      {notice && <div className={`auth-notice ${notice.kind}`}>{notice.message}<button onClick={onDismissNotice}>×</button></div>}
      {localError && <div className="auth-error" role="alert">{localError}</div>}
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        {mode === 'login' && <><label className="field-label"><span>Username or email</span><input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="you@company.com" required /></label><label className="field-label"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label></>}
        {mode === 'register' && <><label className="field-label"><span>Company name</span><input autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={100} required /></label><label className="field-label"><span>Company currency</span><select value={companyCurrency} onChange={(event) => setCompanyCurrency(event.target.value)}><option value="MWK">MWK · Malawi Kwacha</option><option value="USD">USD · US Dollar</option><option value="ZAR">ZAR · South African Rand</option><option value="GBP">GBP · Pound Sterling</option><option value="EUR">EUR · Euro</option></select></label><label className="field-label"><span>Your username</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={50} required /></label><label className="field-label"><span>Work email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={100} required /></label><label className="field-label"><span>Password</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /><small className="helper-text">Use at least 8 characters.</small></label></>}
        {mode === 'forgot' && <><label className="field-label"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{resetHint && <p className="success-message">{resetHint}</p>}{resetToken && <div className="dev-token"><b>Development reset token</b><code>{resetToken}</code><button type="button" className="text-button" onClick={() => setMode('reset')}>Continue to reset →</button></div>}</>}
        {mode === 'reset' && <><label className="field-label"><span>Reset token</span><input value={resetToken} onChange={(event) => setResetToken(event.target.value)} required /></label><label className="field-label"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label></>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset instructions' : 'Reset password'}<span>→</span></button>
      </form>
      {mode === 'login' && <button className="text-button forgot-link" onClick={() => { setMode('forgot'); setLocalError('') }}>Forgot password?</button>}
      <div className="auth-switch">{mode === 'login' ? <>New to MarketMesh? <button onClick={() => { setMode('register'); setLocalError('') }}>Create an account</button></> : <>Already have an account? <button onClick={() => { setMode('login'); setLocalError(''); setResetHint('') }}>Sign in</button></>}</div>
      {sessionData?.emailVerificationToken && <div className="dev-token auth-token"><button className="close-token" onClick={onDismissToken}>×</button><b>Development email verification token</b><code>{sessionData.emailVerificationToken}</code><small>Verify this from My profile after signing in.</small></div>}
      <div className="auth-security"><Icon name="shield" />Encrypted session <span>·</span> Access tokens rotate automatically</div>
    </div></div>
  </div>
}

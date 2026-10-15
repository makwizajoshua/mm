import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { errorMessage, prettyDate } from '../utils'
import type { Notice, Profile } from '../types'
import { ConfirmDialog, PageHeading } from './common'
import { FieldInput } from './resources/ResourcePage'

export function ProfilePage({ profile, initialToken, onProfileChange, onNotify, onSignOut }: { profile: Profile; initialToken?: string; onProfileChange: (profile: Profile) => void; onNotify: (message: string, kind?: Notice['kind']) => void; onSignOut: () => Promise<void> }) {
  const [username, setUsername] = useState(profile.username)
  const [email, setEmail] = useState(profile.email)
  const [password, setPassword] = useState('')
  const [verificationToken, setVerificationToken] = useState(initialToken ?? '')
  const [verifyInput, setVerifyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body: Record<string, string> = {}
    if (username !== profile.username) body.username = username
    if (email !== profile.email) body.email = email
    if (password) body.password = password
    if (!Object.keys(body).length) { onNotify('There are no profile changes to save.', 'error'); return }
    setBusy(true)
    try {
      const result = await api.request<{ user: Profile }>('/users/me', { method: 'PATCH', body: JSON.stringify(body) })
      onProfileChange(result.user)
      setPassword('')
      onNotify('Profile updated.')
    } catch (err) { onNotify(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  const sendVerification = async () => {
    setBusy(true)
    try {
      const response = await api.request<{ message: string; verificationToken?: string }>('/auth/send-verification', { method: 'POST' })
      setVerificationToken(response.verificationToken ?? '')
      onNotify(response.message)
    } catch (err) { onNotify(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verifyInput }) })
      const updated = await api.request<Profile>('/users/me')
      onProfileChange(updated)
      setVerificationToken('')
      setVerifyInput('')
      onNotify('Email address verified.')
    } catch (err) { onNotify(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  const deleteAccount = async () => {
    setBusy(true)
    try {
      await api.request('/users/me', { method: 'DELETE' })
      onNotify('Account deleted.')
      await onSignOut()
    } catch (err) { onNotify(errorMessage(err), 'error') } finally { setBusy(false); setConfirmDelete(false) }
  }
  return <>
    <PageHeading eyebrow="ACCOUNT SETTINGS" title="My profile" subtitle="Manage your identity, verification, and account security." />
    <div className="profile-layout">
      <section className="panel profile-card">
        <div className="profile-identity"><span className="profile-avatar">{profile.username.slice(0, 1).toUpperCase()}</span><div><h2>{profile.username}</h2><p>{profile.email}</p><span className={`verification ${profile.email_verified ? 'verified' : 'unverified'}`}>{profile.email_verified ? '✓ Verified email' : 'Email not verified'}</span></div></div>
        <form className="resource-form profile-form" onSubmit={(event) => void save(event)}>
          <FieldInput field={{ name: 'username', label: 'Username', required: true }} value={username} options={[]} onChange={setUsername} />
          <FieldInput field={{ name: 'email', label: 'Email address', required: true }} value={email} options={[]} onChange={setEmail} />
          <FieldInput field={{ name: 'password', label: 'New password' }} value={password} options={[]} onChange={setPassword} />
          <small className="helper-text">Leave the password blank to keep the current one. Use at least 8 characters when changing it.</small>
          <div className="profile-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button><span>Member since {prettyDate(profile.created_at)}</span></div>
        </form>
      </section>
      <section className="panel security-card">
        <div className="panel-heading"><div><h2>Email verification</h2><p>Verify your email to keep your account secure.</p></div><span className={`verification-dot ${profile.email_verified ? 'verified' : ''}`} /></div>
        {profile.email_verified ? <div className="verification-complete"><span>✓</span><div><b>Your email is verified</b><p>Account recovery can use {profile.email}.</p></div></div> : <>
          <button className="button button-secondary" onClick={() => void sendVerification()} disabled={busy}>Send verification link</button>
          {verificationToken && <div className="dev-token"><b>Development verification token</b><code>{verificationToken}</code><small>Token display is enabled in non-production backend mode.</small></div>}
          <form className="verify-form" onSubmit={(event) => void verify(event)}><label className="field-label"><span>Verification token</span><input value={verifyInput} onChange={(event) => setVerifyInput(event.target.value)} required /></label><button className="button button-primary" disabled={busy}>Verify email</button></form>
        </>}
      </section>
      <section className="panel danger-zone"><div><h2>Delete account</h2><p>Permanently remove your account and its sessions. This cannot be undone.</p></div><button className="button button-danger-outline" onClick={() => setConfirmDelete(true)}>Delete account</button></section>
    </div>
    {confirmDelete && <ConfirmDialog title="Delete your account?" message="This will permanently delete your profile and revoke all sessions. Related records may be affected." busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteAccount()} />}
  </>
}

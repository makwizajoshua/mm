import { useCallback, useEffect, useRef, useState } from 'react'
import { api, SESSION_EXPIRED_EVENT, type SessionData } from './api'
import { resources } from './data'
import { AuthScreen } from './components/AuthScreen'
import { CompanySetup, Dashboard } from './components/Dashboard'
import { ProfilePage } from './components/ProfilePage'
import { ResourcePage } from './components/resources/ResourcePage'
import { Icon } from './components/common'
import { errorMessage, iconForResource } from './utils'
import type { Access, Company, Notice, Profile } from './types'
import './App.css'

function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [checkingSession, setCheckingSession] = useState(() => api.authenticated)
  const [section, setSection] = useState('dashboard')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(() => api.activeTenantId)
  const [access, setAccess] = useState<Access | null>(null)

  const loadProfile = useCallback(async () => {
    const current = await api.request<Profile>('/users/me')
    setProfile(current)
  }, [])

  const loadCompanies = useCallback(async () => {
    const result = await api.request<{ data: Company[] }>('/users/me/tenants')
    setCompanies(result.data)
    const selected = result.data.find((company) => company.id === api.activeTenantId) ?? result.data[0]
    const tenantId = selected?.id ?? null
    api.setActiveTenant(tenantId)
    setActiveCompanyId(tenantId)
  }, [])

  useEffect(() => {
    if (!api.authenticated) return
    const timer = window.setTimeout(() => {
      loadProfile().then(loadCompanies).catch((error: unknown) => {
        if (error instanceof Error && 'status' in error && error.status === 401) {
          api.clearSession()
          return
        }
        setNotice({ kind: 'error', message: `Could not restore your session: ${errorMessage(error)}` })
      }).finally(() => setCheckingSession(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCompanies, loadProfile])

  useEffect(() => {
    if (!profile || activeCompanyId === null) return
    let cancelled = false
    api.request<Access>('/access').then((result) => { if (!cancelled) setAccess(result) }).catch((error: unknown) => {
      if (!cancelled) {
        setAccess(null)
        setNotice({ kind: 'error', message: `Could not load your permissions: ${errorMessage(error)}` })
      }
    })
    return () => { cancelled = true }
  }, [profile, activeCompanyId])
  const can = useCallback((endpoint: string, kind: 'read' | 'write' = 'read') => Boolean(access?.permissions[endpoint]?.[kind]), [access])

  const noticeTimer = useRef<number | undefined>(undefined)
  const notify = useCallback((message: string, kind: Notice['kind'] = 'success') => {
    setNotice({ message, kind })
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
  }, [])

  useEffect(() => {
    const expire = () => {
      setProfile(null)
      setSessionData(null)
      setCompanies([])
      setActiveCompanyId(null)
      setAccess(null)
      setSection('dashboard')
      notify('Your session expired. Please sign in again.', 'error')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, expire)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire)
  }, [notify])

  const signIn = async (session: SessionData) => {
    setSessionData(session)
    await loadProfile()
    await loadCompanies()
    setSection('dashboard')
    notify('You are signed in.')
  }
  const signOut = async () => {
    try {
      await api.logout()
      notify('You have been signed out.')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setProfile(null)
      setSessionData(null)
      setCompanies([])
      setActiveCompanyId(null)
      setAccess(null)
      setSection('dashboard')
    }
  }

  if (checkingSession) return <div className="boot-screen"><span className="brand-mark">M</span><span>Connecting to MarketMesh…</span></div>
  if (!profile) {
    return <AuthScreen
      onSignedIn={signIn}
      sessionData={sessionData}
      onDismissToken={() => setSessionData(null)}
      notice={notice}
      onNotice={notify}
      onDismissNotice={() => setNotice(null)}
    />
  }

  const currentResource = resources.find((resource) => resource.key === section)
  const title = section === 'dashboard' ? 'Overview' : section === 'profile' ? 'My profile' : currentResource?.label ?? 'Overview'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><span className="brand-mark">M</span><span>market<span className="brand-light">mesh</span></span></div>
        <label className="workspace-pill"><span className="workspace-avatar">{(companies.find((company) => company.id === activeCompanyId)?.name ?? profile.username).slice(0, 1).toUpperCase()}</span><span><b>{companies.find((company) => company.id === activeCompanyId)?.name ?? profile.username}</b><small>{access ? (access.isAdmin ? 'Owner' : access.roles.map((role) => role.replace('_', ' ')).join(', ')) : 'Active company'}</small></span><select aria-label="Active company" value={activeCompanyId ?? ''} onChange={(event) => { const next = companies.find((company) => company.id === Number(event.target.value)); api.setActiveTenant(next?.id ?? null); setActiveCompanyId(next?.id ?? null) }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <nav aria-label="Main navigation">
          <button className={`nav-item ${section === 'dashboard' ? 'active' : ''}`} onClick={() => { setSection('dashboard'); setMobileMenu(false) }}><Icon name="grid" />Overview</button>
          {['Sales', 'Finance', 'Inventory', 'People', 'Locations', 'Governance'].filter((group) => resources.some((item) => item.group === group && can(item.endpoint))).map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-caption">{group}</p>
              {resources.filter((item) => item.group === group && can(item.endpoint)).map((item) => (
                <button key={item.key} className={`nav-item ${section === item.key ? 'active' : ''}`} onClick={() => { setSection(item.key); setMobileMenu(false) }}>
                  <Icon name={iconForResource(item.key)} />{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className={`nav-item ${section === 'profile' ? 'active' : ''}`} onClick={() => { setSection('profile'); setMobileMenu(false) }}><Icon name="user" />My profile</button>
          <div className="sidebar-user"><span className="avatar">{profile.username.slice(0, 1).toUpperCase()}</span><span className="user-copy"><b>{profile.username}</b><small>{profile.email}</small></span><button className="icon-button signout" title="Sign out" onClick={signOut}><Icon name="logout" /></button></div>
        </div>
      </aside>
      {mobileMenu && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="slash">/</span><b>{title}</b></div>
          <div className="topbar-actions"><div className="connection"><span className="status-dot" />API connected</div><button className="top-avatar" title="Open profile" onClick={() => setSection('profile')}>{profile.username.slice(0, 1).toUpperCase()}</button></div>
        </header>
        {notice && <div className={`toast ${notice.kind}`} role="status"><span>{notice.kind === 'success' ? '✓' : '!'}</span>{notice.message}<button onClick={() => setNotice(null)} aria-label="Dismiss notification">×</button></div>}
        <div className="page-content">
          {companies.length && !access
            ? <div className="boot-screen"><span>Loading your workspace…</span></div>
            : !companies.length
            ? <CompanySetup onCreated={(company) => { setCompanies([company]); api.setActiveTenant(company.id); setActiveCompanyId(company.id); notify(`${company.name} is ready.`) }} onError={(message) => notify(message, 'error')} />
            : section === 'dashboard'
            ? <Dashboard key={activeCompanyId ?? 'no-company'} profile={profile} can={can} onNavigate={setSection} onError={(message) => notify(message, 'error')} />
            : section === 'profile'
              ? <ProfilePage profile={profile} initialToken={sessionData?.emailVerificationToken} onProfileChange={setProfile} onNotify={notify} onSignOut={signOut} />
              : currentResource
                ? <ResourcePage key={`${currentResource.key}:${activeCompanyId ?? 'no-company'}`} resource={currentResource} can={can} isOwner={Boolean(access?.isAdmin)} onNotify={notify} />
                : <Dashboard profile={profile} can={can} onNavigate={setSection} onError={(message) => notify(message, 'error')} />}
        </div>
        <footer className="page-footer"><span>MarketMesh <span className="footer-dot">·</span> Operations workspace</span><span>Secure session <span className="status-dot" /></span></footer>
      </main>
    </div>
  )
}

export default App

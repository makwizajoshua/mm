import { useCallback, useEffect, useState } from 'react'
import { api, type SessionData } from './api'
import { resources } from './data'
import { AuthScreen } from './components/AuthScreen'
import { CompanySetup, Dashboard, iconForResource } from './components/Dashboard'
import { ProfilePage } from './components/ProfilePage'
import { ResourcePage } from './components/resources/ResourcePage'
import { Icon } from './components/common'
import { errorMessage } from './utils'
import type { Company, Notice, Profile } from './types'
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

  const loadProfile = useCallback(async () => {
    const current = await api.request<Profile>('/users/me')
    setProfile(current)
  }, [])

  const loadCompanies = useCallback(async () => {
    const result = await api.request<{ data: Company[] }>('/users/me/tenants')
    setCompanies(result.data)
    const selected = result.data.find((company) => company.id === api.activeTenantId) ?? result.data[0]
    const tenantId = selected?.id ?? null
    api.setActiveTenant(tenantId, selected?.currency ?? 'MWK')
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

  const notify = useCallback((message: string, kind: Notice['kind'] = 'success') => {
    setNotice({ message, kind })
    window.setTimeout(() => setNotice(null), 5000)
  }, [])

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
        <label className="workspace-pill"><span className="workspace-avatar">{(companies.find((company) => company.id === activeCompanyId)?.name ?? profile.username).slice(0, 1).toUpperCase()}</span><span><b>{companies.find((company) => company.id === activeCompanyId)?.name ?? profile.username}</b><small>Active company · {companies.find((company) => company.id === activeCompanyId)?.currency ?? 'MWK'}</small></span><select aria-label="Active company" value={activeCompanyId ?? ''} onChange={(event) => { const next = companies.find((company) => company.id === Number(event.target.value)); api.setActiveTenant(next?.id ?? null, next?.currency); setActiveCompanyId(next?.id ?? null) }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <nav aria-label="Main navigation">
          <button className={`nav-item ${section === 'dashboard' ? 'active' : ''}`} onClick={() => { setSection('dashboard'); setMobileMenu(false) }}><Icon name="grid" />Overview</button>
          {['Sales', 'Finance', 'Inventory', 'People', 'Locations', 'Governance'].map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-caption">{group}</p>
              {resources.filter((item) => item.group === group).map((item) => (
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
          {!companies.length
            ? <CompanySetup onCreated={(company) => { setCompanies([company]); api.setActiveTenant(company.id, company.currency); setActiveCompanyId(company.id); notify(`${company.name} is ready.`) }} onError={(message) => notify(message, 'error')} />
            : section === 'dashboard'
            ? <Dashboard key={activeCompanyId ?? 'no-company'} profile={profile} onNavigate={setSection} onError={(message) => notify(message, 'error')} />
            : section === 'profile'
              ? <ProfilePage profile={profile} initialToken={sessionData?.emailVerificationToken} onProfileChange={setProfile} onNotify={notify} onSignOut={signOut} />
              : currentResource
                ? <ResourcePage key={`${currentResource.key}:${activeCompanyId ?? 'no-company'}`} resource={currentResource} onNotify={notify} />
                : <Dashboard profile={profile} onNavigate={setSection} onError={(message) => notify(message, 'error')} />}
        </div>
        <footer className="page-footer"><span>MarketMesh <span className="footer-dot">·</span> Operations workspace</span><span>Secure session <span className="status-dot" /></span></footer>
      </main>
    </div>
  )
}

export default App

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { api, type PageResult, type SessionData } from './api'
import { associations, endpointLabel, resources, type AssociationSpec, type FieldSpec, type ResourceSpec } from './data'
import './App.css'

type Row = Record<string, unknown> & { id: number }
type Profile = { id: number; username: string; email: string; email_verified: boolean; created_at: string; updated_at?: string }
type Notice = { kind: 'success' | 'error'; message: string }

const prettyDate = (value: unknown) => {
  if (!value) return '—'
  const date = new Date(String(value))
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const currency = (value: unknown) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value) || 0)

function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [checkingSession, setCheckingSession] = useState(() => api.authenticated)
  const [section, setSection] = useState('dashboard')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [sessionData, setSessionData] = useState<SessionData | null>(null)

  const loadProfile = useCallback(async () => {
    const current = await api.request<Profile>('/users/me')
    setProfile(current)
  }, [])

  useEffect(() => {
    if (!api.authenticated) return
    const timer = window.setTimeout(() => {
      loadProfile().catch((error: unknown) => {
        if (error instanceof Error && 'status' in error && error.status === 401) {
          api.clearSession()
          return
        }
        setNotice({ kind: 'error', message: `Could not restore your session: ${errorMessage(error)}` })
      }).finally(() => setCheckingSession(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadProfile])

  const notify = useCallback((message: string, kind: Notice['kind'] = 'success') => {
    setNotice({ message, kind })
    window.setTimeout(() => setNotice(null), 5000)
  }, [])

  const signIn = async (session: SessionData) => {
    setSessionData(session)
    await loadProfile()
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
  const currentAssociation = associations.find((association) => association.key === section)
  const title = section === 'dashboard' ? 'Overview' : section === 'profile' ? 'My profile' : currentResource?.label ?? currentAssociation?.label ?? 'Overview'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><span className="brand-mark">M</span><span>market<span className="brand-light">mesh</span></span></div>
        <div className="workspace-pill"><span className="workspace-avatar">{profile.username.slice(0, 1).toUpperCase()}</span><span><b>{profile.username}</b><small>Workspace console</small></span><span className="chevron">⌄</span></div>
        <nav aria-label="Main navigation">
          <button className={`nav-item ${section === 'dashboard' ? 'active' : ''}`} onClick={() => { setSection('dashboard'); setMobileMenu(false) }}><Icon name="grid" />Overview</button>
          {['Commerce', 'Catalog', 'Workspace', 'Access'].map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-caption">{group}</p>
              {resources.filter((item) => item.group === group).map((item) => (
                <button key={item.key} className={`nav-item ${section === item.key ? 'active' : ''}`} onClick={() => { setSection(item.key); setMobileMenu(false) }}>
                  <Icon name={iconForResource(item.key)} />{item.label}
                </button>
              ))}
              {group === 'Access' && associations.map((item) => (
                <button key={item.key} className={`nav-item nav-subitem ${section === item.key ? 'active' : ''}`} onClick={() => { setSection(item.key); setMobileMenu(false) }}>
                  <Icon name="link" />{item.label}
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
          {section === 'dashboard'
            ? <Dashboard profile={profile} onNavigate={setSection} onError={(message) => notify(message, 'error')} />
            : section === 'profile'
              ? <ProfilePage profile={profile} initialToken={sessionData?.emailVerificationToken} onProfileChange={setProfile} onNotify={notify} onSignOut={signOut} />
              : currentResource
                ? <ResourcePage key={currentResource.key} resource={currentResource} onNotify={notify} />
                : currentAssociation
                  ? <AssociationPage key={currentAssociation.key} association={currentAssociation} onNotify={notify} />
                  : <Dashboard profile={profile} onNavigate={setSection} onError={(message) => notify(message, 'error')} />}
        </div>
        <footer className="page-footer"><span>MarketMesh <span className="footer-dot">·</span> Operations workspace</span><span>Secure session <span className="status-dot" /></span></footer>
      </main>
    </div>
  )
}

function Dashboard({ profile, onNavigate, onError }: { profile: Profile; onNavigate: (section: string) => void; onError: (message: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [stats, setStats] = useState({ orders: 0, sales: 0, products: 0, stock: 0, lowStock: 0, pending: 0 })
  const [latestOrders, setLatestOrders] = useState<Row[]>([])
  const [lowStockItems, setLowStockItems] = useState<Row[]>([])

  const reload = useCallback(async () => {
    setLoading(true)
    const endpoints = ['orders', 'transactions', 'products', 'stock-items', 'markets', 'tenants'] as const
    const results = await Promise.allSettled(endpoints.map((endpoint) => api.list<Row>(endpoint, { limit: 100, sort: 'id', order: 'desc' })))
    const failures = results.filter((result) => result.status === 'rejected')
    const records = Object.fromEntries(endpoints.map((endpoint, index) => [
      endpoint,
      results[index].status === 'fulfilled' ? results[index].value.data : [],
    ])) as Record<(typeof endpoints)[number], Row[]>
    const orders = records.orders
    const transactions = records.transactions
    const inventory = records['stock-items']
    setStats({
      orders: results[0].status === 'fulfilled' ? results[0].value.pagination.total : orders.length,
      sales: transactions.filter((transaction) => transaction.status === 'completed').reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      products: results[2].status === 'fulfilled' ? results[2].value.pagination.total : records.products.length,
      stock: inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      lowStock: inventory.filter((item) => Number(item.quantity || 0) <= 5).length,
      pending: orders.filter((order) => String(order.status).toLowerCase() === 'pending').length,
    })
    setLatestOrders(orders.slice(0, 5))
    setLowStockItems(inventory.filter((item) => Number(item.quantity || 0) <= 5).slice(0, 5))
    if (failures.length) onError(`${failures.length} dashboard data source${failures.length === 1 ? '' : 's'} could not be loaded. Check access and API availability.`)
    const healthResult = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/health`).then((response) => response.ok).catch(() => false)
    setHealth(healthResult ? 'online' : 'offline')
    setLoading(false)
  }, [onError])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return reload() })
    return () => { cancelled = true }
  }, [reload])

  return (
    <>
      <div className="welcome-row">
        <div><div className="eyebrow">THURSDAY, {new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase()}</div><h1>Good to see you, {profile.username}</h1><p className="page-subtitle">Here’s what’s happening across your operation today.</p></div>
        <button className="button button-secondary" onClick={() => void reload()} disabled={loading}><Icon name="refresh" />{loading ? 'Refreshing…' : 'Refresh data'}</button>
      </div>
      <div className="overview-status"><span className={`status-dot ${health === 'offline' ? 'offline' : ''}`} />Backend {health === 'checking' ? 'checking…' : health === 'online' ? 'operational' : 'unavailable'}<span className="status-divider" />Signed in as <b>{profile.email}</b><span className="status-divider" />{profile.email_verified ? 'Email verified' : 'Email not verified'}</div>
      <section className="metric-grid" aria-label="Key metrics">
        <Metric label="Total orders" value={loading ? '—' : stats.orders.toLocaleString()} note={`${stats.pending} pending fulfillment`} icon="bag" tone="blue" />
        <Metric label="Captured payments · latest 100" value={loading ? '—' : currency(stats.sales)} note="Completed transactions in the latest page" icon="chart" tone="green" />
        <Metric label="Active products" value={loading ? '—' : stats.products.toLocaleString()} note="Catalog items available" icon="box" tone="violet" />
        <Metric label="Units · latest 100 stock rows" value={loading ? '—' : stats.stock.toLocaleString()} note={`${stats.lowStock} rows at or below 5 units`} icon="layers" tone="amber" />
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading"><div><h2>Recent orders</h2><p>Your latest customer activity</p></div><button className="text-button" onClick={() => onNavigate('orders')}>View all <span>→</span></button></div>
          {loading ? <LoadingRows /> : latestOrders.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Store</th><th>Placed</th><th>Total</th><th>Status</th></tr></thead><tbody>{latestOrders.map((order) => <tr key={order.id}><td><button className="id-link" onClick={() => onNavigate('orders')}>#{order.id}</button></td><td>Store #{displayValue(order.store_id)}</td><td>{prettyDate(order.created_at)}</td><td className="strong">{currency(order.total)}</td><td><StatusPill status={String(order.status)} /></td></tr>)}</tbody></table></div> : <EmptyState title="No orders yet" detail="Orders will appear here when they are created." action="Create an order" onAction={() => onNavigate('orders')} /> }
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Inventory watch</h2><p>Latest inventory rows with 5 units or fewer</p></div><button className="text-button" onClick={() => onNavigate('stock-items')}>Inventory <span>→</span></button></div>
          {loading ? <LoadingRows /> : lowStockItems.length ? <div className="watch-list">{lowStockItems.map((item) => <div className="watch-item" key={item.id}><span className="watch-icon"><Icon name="box" /></span><span className="watch-name"><b>Product #{displayValue(item.product_id)}</b><small>Store #{displayValue(item.store_id)}</small></span><span className={`stock-count ${Number(item.quantity) === 0 ? 'out' : ''}`}>{displayValue(item.quantity)} left</span></div>)}</div> : <EmptyState title="Stock looks healthy" detail="No inventory is at the low-stock threshold." action="View inventory" onAction={() => onNavigate('stock-items')} /> }
        </section>
      </div>
      <section className="quick-actions"><div><h2>Quick access</h2><p>Jump into your most-used tools</p></div><div className="quick-action-list">
        {[['orders', 'New order', 'bag'], ['products', 'Add product', 'box'], ['markets', 'Manage markets', 'map'], ['user-roles', 'Access control', 'shield']].map(([target, label, icon]) => <button key={target} className="quick-action" onClick={() => onNavigate(target)}><span className="quick-icon"><Icon name={icon} /></span><span>{label}</span><b>→</b></button>)}
      </div></section>
    </>
  )
}

function Metric({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: string; tone: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon name={icon} /></span></div><strong>{value}</strong><small>{note}</small></div>
}

function ResourcePage({ resource, onNotify }: { resource: ResourceSpec; onNotify: (message: string, kind?: Notice['kind']) => void }) {
  const [result, setResult] = useState<PageResult<Row> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [sort, setSort] = useState('id')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Row | null | false>(false)
  const [viewing, setViewing] = useState<Row | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query: Record<string, string | number | undefined> = { page, limit, sort, order, ...filters }
      if (resource.searchable && search.trim()) query.search = search.trim()
      setResult(await api.list<Row>(resource.endpoint, query))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [filters, limit, order, page, resource.endpoint, resource.searchable, search, sort])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return load() })
    return () => { cancelled = true }
  }, [load])
  const columns = useMemo(() => {
    const first = resource.fields.map((item) => item.name)
    return ['id', ...first, 'created_at'].slice(0, 6)
  }, [resource.fields])

  const save = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      if (editing && typeof editing === 'object') await api.update(resource.endpoint, editing.id, body)
      else await api.create(resource.endpoint, body)
      onNotify(`${resource.singular} ${editing ? 'updated' : 'created'} successfully.`)
      setEditing(false)
      await load()
    } catch (err) {
      onNotify(errorMessage(err), 'error')
      throw err
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await api.remove(resource.endpoint, pendingDelete.id)
      onNotify(`${resource.singular} deleted.`)
      setPendingDelete(null)
      await load()
    } catch (err) {
      onNotify(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  const toggleSort = (column: string) => {
    if (sort === column) setOrder((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSort(column); setOrder('asc') }
    setPage(1)
  }
  const openDetails = async (row: Row) => {
    setViewing(row)
    setLoadingDetail(true)
    try {
      setViewing(await api.get<Row>(resource.endpoint, row.id))
    } catch (err) {
      onNotify(`Could not load full record details: ${errorMessage(err)}`, 'error')
    } finally {
      setLoadingDetail(false)
    }
  }

  return (
    <>
      <PageHeading eyebrow={resource.group.toUpperCase()} title={resource.label} subtitle={resource.description}>
        <button className="button button-primary" onClick={() => setEditing(null)}><Icon name="plus" />{resource.key === 'audits' ? 'Log audit event' : `Add ${resource.singular.toLowerCase()}`}</button>
      </PageHeading>
      <section className="panel resource-panel">
        <div className="resource-toolbar">
          <div className="toolbar-title"><b>{result?.pagination.total ?? 0}</b> records <span className="toolbar-dot">·</span> {resource.readOnly ? 'Read-only' : 'Live data'}</div>
          <div className="toolbar-controls">
            {resource.searchable && <label className="search-control"><Icon name="search" /><input aria-label={`Search ${resource.label.toLowerCase()}`} placeholder={`Search ${resource.label.toLowerCase()}…`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>}
            {resource.filters?.map((filter) => <FilterControl key={filter} name={filter} resource={resource} value={filters[filter] ?? ''} onChange={(value) => { setFilters((current) => ({ ...current, [filter]: value })); setPage(1) }} />)}
            <button className="button button-secondary button-compact" onClick={() => void load()} disabled={loading}><Icon name="refresh" />Refresh</button>
          </div>
        </div>
        {error && <InlineError message={error} onRetry={() => void load()} />}
        <div className="table-wrap data-table">
          {loading ? <LoadingRows /> : result?.data.length ? <table><thead><tr>{columns.map((column) => <th key={column}>{resource.sortableFields.includes(column) ? <button className="sort-button" onClick={() => toggleSort(column)}>{titleCase(column)}{sort === column && <span>{order === 'asc' ? ' ↑' : ' ↓'}</span>}</button> : titleCase(column)}</th>)}<th className="actions-heading">Actions</th></tr></thead><tbody>{result.data.map((row) => <tr key={row.id}>
            {columns.map((column) => <td key={column}>{cellFor(resource, column, row[column])}</td>)}
          <td className="row-actions"><button className="icon-button" title="View details" onClick={() => void openDetails(row)}><Icon name="eye" /></button>{!resource.readOnly && <><button className="icon-button" title={`Edit ${resource.singular}`} onClick={() => setEditing(row)}><Icon name="edit" /></button><button className="icon-button danger-quiet" title={`Delete ${resource.singular}`} onClick={() => setPendingDelete(row)}><Icon name="trash" /></button></>}</td>
          </tr>)}</tbody></table> : <EmptyState title={error ? 'Records could not be loaded' : 'Nothing here yet'} detail={error ? 'Retry the request, or check your access to this resource.' : `No ${resource.label.toLowerCase()} match this view.`} action={error ? 'Retry' : resource.key === 'audits' ? 'Log audit event' : `Add ${resource.singular.toLowerCase()}`} onAction={error ? () => void load() : () => setEditing(null)} />}
        </div>
        <div className="pagination"><div className="pagination-summary"><span>{result?.pagination.total ? `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, result.pagination.total)} of ${result.pagination.total}` : 'No records'}</span><label className="page-size">Rows <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1) }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div><div><button className="button button-secondary button-compact" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>← Previous</button><span className="page-indicator">Page {page}{result?.pagination.total ? ` of ${Math.max(1, Math.ceil(result.pagination.total / limit))}` : ''}</span><button className="button button-secondary button-compact" disabled={loading || !result || page * limit >= result.pagination.total} onClick={() => setPage((value) => value + 1)}>Next →</button></div></div>
      </section>
      {editing !== false && <ResourceForm resource={resource} initial={editing || undefined} busy={busy} onClose={() => setEditing(false)} onSubmit={save} />}
      {viewing && <DetailsDialog title={`${resource.singular} #${viewing.id}`} data={viewing} loading={loadingDetail} onClose={() => setViewing(null)} />}
      {pendingDelete && <ConfirmDialog title={`Delete ${resource.singular.toLowerCase()}?`} message={`This will permanently delete record #${pendingDelete.id}. This action cannot be undone.`} busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />}
    </>
  )
}

function FilterControl({ name, value, onChange }: { name: string; resource: ResourceSpec; value: string; onChange: (value: string) => void }) {
  const [options, setOptions] = useState<Row[]>([])
  const optionEndpoint = endpointForKey(name)
  const shouldSelect = Boolean(optionEndpoint)
  useEffect(() => {
    if (!optionEndpoint) return
    void loadOptions(optionEndpoint).then(setOptions).catch(() => setOptions([]))
  }, [optionEndpoint])
  return <label className="filter-control"><span>{titleCase(name).replace(/ Id$/, '')}</span>{shouldSelect
    ? <select aria-label={`Filter by ${name}`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">All</option>{options.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select>
    : <input aria-label={`Filter by ${name}`} placeholder="All" value={value} onChange={(event) => onChange(event.target.value)} />}</label>
}

function ResourceForm({ resource, initial, busy, onClose, onSubmit }: { resource: ResourceSpec; initial?: Row; busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(resource.fields.map((item) => [item.name, initial?.[item.name] == null ? '' : String(initial[item.name])])))
  const [options, setOptions] = useState<Record<string, Row[]>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const optionFields = resource.fields.filter((item) => item.optionsFrom)
    void Promise.all(optionFields.map(async (item) => [item.name, await loadOptions(item.optionsFrom!)] as const))
      .then((entries) => setOptions(Object.fromEntries(entries)))
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [resource.fields])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const body: Record<string, unknown> = {}
    try {
      for (const item of resource.fields) {
        const value = values[item.name] ?? ''
        if (!value) {
          if (item.required && !initial) throw new Error(`${item.label} is required.`)
          if (value === '' && initial && !item.required) body[item.name] = null
          else if (value === '' && ['number', 'money', 'select'].includes(item.kind ?? 'text')) body[item.name] = null
          else if (value !== '') body[item.name] = value
          continue
        }
        if (item.kind === 'number' || item.kind === 'money') {
          const number = Number(value)
          if (!Number.isFinite(number)) throw new Error(`${item.label} must be a valid number.`)
          body[item.name] = number
        } else if (item.kind === 'json') {
          try { body[item.name] = JSON.parse(value) as unknown } catch { throw new Error(`${item.label} must contain valid JSON.`) }
        } else if (item.optionsFrom) body[item.name] = Number(value)
        else body[item.name] = value
      }
      await onSubmit(body)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return <Modal title={`${initial ? 'Edit' : 'Create'} ${resource.singular.toLowerCase()}`} subtitle={initial ? `Update record #${initial.id}` : `Add a new ${resource.singular.toLowerCase()} to your workspace.`} onClose={onClose}>
    <form className="resource-form" onSubmit={(event) => void submit(event)}>
      {resource.fields.map((item) => <FieldInput key={item.name} field={item} value={values[item.name] ?? ''} options={options[item.name] ?? []} onChange={(value) => setValues((current) => ({ ...current, [item.name]: value }))} />)}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving || busy}>{saving || busy ? 'Saving…' : initial ? 'Save changes' : `Create ${resource.singular.toLowerCase()}`}</button></div>
    </form>
  </Modal>
}

function FieldInput({ field, value, options, onChange }: { field: FieldSpec; value: string; options: Row[]; onChange: (value: string) => void }) {
  const common = { id: `field-${field.name}`, name: field.name, value, required: field.required, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) }
  const inputType = field.name === 'password' ? 'password' : field.name === 'email' ? 'email' : field.kind === 'number' || field.kind === 'money' ? 'number' : 'text'
  return <label className="field-label" htmlFor={common.id}><span>{field.label}{field.required && <i> *</i>}</span>{field.kind === 'textarea' || field.kind === 'json'
    ? <textarea {...common} rows={field.kind === 'json' ? 5 : 3} placeholder={field.kind === 'json' ? '{\n  "key": "value"\n}' : `Enter ${field.label.toLowerCase()}`} />
    : field.kind === 'select'
      ? <select {...common}><option value="">Select {field.label.toLowerCase()}…</option>{field.values?.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}{field.optionsFrom && options.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select>
    : field.kind === 'suggestion'
      ? <><input {...common} list={`suggestions-${field.name}`} placeholder={`Enter ${field.label.toLowerCase()}`} /><datalist id={`suggestions-${field.name}`}>{field.values?.map((item) => <option key={item} value={item} />)}</datalist></>
      : <input {...common} type={inputType} step={field.step ?? (field.kind === 'money' ? '0.01' : field.kind === 'number' ? '1' : undefined)} placeholder={field.kind === 'money' ? '0.00' : `Enter ${field.label.toLowerCase()}`} />}</label>
}

function AssociationPage({ association, onNotify }: { association: AssociationSpec; onNotify: (message: string, kind?: Notice['kind']) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [leftOptions, setLeftOptions] = useState<Row[]>([])
  const [rightOptions, setRightOptions] = useState<Row[]>([])
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const [leftFilter, setLeftFilter] = useState('')
  const [rightFilter, setRightFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (leftFilter) query.set(association.leftKey, leftFilter)
      if (rightFilter) query.set(association.rightKey, rightFilter)
      const [result, left, right] = await Promise.all([
        api.request<{ data: Row[] }>(`/associations/${association.key}${query.size ? `?${query}` : ''}`),
        loadOptions(association.leftEndpoint),
        loadOptions(association.rightEndpoint),
      ])
      setRows(result.data)
      setLeftOptions(left)
      setRightOptions(right)
    } catch (err) {
      setError(errorMessage(err))
    } finally { setLoading(false) }
  }, [association, leftFilter, rightFilter])
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return load() })
    return () => { cancelled = true }
  }, [load])

  const visibleRows = rows.filter((row) => {
    const left = optionLabel(leftOptions.find((item) => item.id === Number(row[association.leftKey])) ?? { id: Number(row[association.leftKey]) })
    const right = optionLabel(rightOptions.find((item) => item.id === Number(row[association.rightKey])) ?? { id: Number(row[association.rightKey]) })
    return `${left} ${right}`.toLowerCase().includes(search.toLowerCase())
  })
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!leftId || !rightId) return
    setBusy(true)
    try {
      const response = await api.request<{ created: boolean }>(`/associations/${association.key}`, { method: 'POST', body: JSON.stringify({ [association.leftKey]: Number(leftId), [association.rightKey]: Number(rightId) }) })
      onNotify(response.created ? 'Association added.' : 'That association already exists.')
      setLeftId('')
      setRightId('')
      await load()
    } catch (err) { onNotify(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  const remove = async (row: Row) => {
    setBusy(true)
    try {
      await api.request(`/associations/${association.key}/${row[association.leftKey]}/${row[association.rightKey]}`, { method: 'DELETE' })
      onNotify('Association removed.')
      await load()
    } catch (err) { onNotify(errorMessage(err), 'error') } finally { setBusy(false) }
  }

  return <>
    <PageHeading eyebrow="ACCESS CONTROL" title={association.label} subtitle={`Connect ${association.leftLabel.toLowerCase()} records with ${association.rightLabel.toLowerCase()} records. Changes apply immediately.`} />
    <section className="panel association-create">
      <div className="panel-heading"><div><h2>Create an association</h2><p>Assign a {association.rightLabel.toLowerCase()} to a {association.leftLabel.toLowerCase()}.</p></div><span className="permission-tag">Relationship manager</span></div>
      <form className="association-form" onSubmit={(event) => void add(event)}>
        <label className="field-label"><span>{association.leftLabel}</span><select required value={leftId} onChange={(event) => setLeftId(event.target.value)}><option value="">Choose {association.leftLabel.toLowerCase()}…</option>{leftOptions.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
        <span className="association-arrow">→</span>
        <label className="field-label"><span>{association.rightLabel}</span><select required value={rightId} onChange={(event) => setRightId(event.target.value)}><option value="">Choose {association.rightLabel.toLowerCase()}…</option>{rightOptions.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
        <button className="button button-primary" disabled={busy || !leftOptions.length || !rightOptions.length}><Icon name="plus" />Add link</button>
      </form>
      {(leftOptions.length === 0 || rightOptions.length === 0) && !loading && <p className="helper-text">Create the related records first. This relationship requires existing {association.leftLabel.toLowerCase()} and {association.rightLabel.toLowerCase()} records.</p>}
    </section>
    <section className="panel resource-panel association-list">
      <div className="resource-toolbar">
        <div className="toolbar-title"><b>{rows.length}</b> relationships</div>
        <div className="toolbar-controls association-controls">
          <label className="filter-control"><span>{association.leftLabel}</span><select aria-label={`Filter by ${association.leftLabel}`} value={leftFilter} onChange={(event) => setLeftFilter(event.target.value)}><option value="">All</option>{leftOptions.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
          <label className="filter-control"><span>{association.rightLabel}</span><select aria-label={`Filter by ${association.rightLabel}`} value={rightFilter} onChange={(event) => setRightFilter(event.target.value)}><option value="">All</option>{rightOptions.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
          <label className="search-control"><Icon name="search" /><input aria-label="Search relationships" placeholder="Search relationships…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </div>
      </div>
      {error && <InlineError message={error} onRetry={() => void load()} />}
      <div className="table-wrap">{loading ? <LoadingRows /> : visibleRows.length ? <table><thead><tr><th>{association.leftLabel}</th><th></th><th>{association.rightLabel}</th><th className="actions-heading">Actions</th></tr></thead><tbody>{visibleRows.map((row, index) => {
        const left = leftOptions.find((item) => item.id === Number(row[association.leftKey]))
        const right = rightOptions.find((item) => item.id === Number(row[association.rightKey]))
        return <tr key={`${row[association.leftKey]}-${row[association.rightKey]}-${index}`}><td><span className="entity-chip">{optionLabel(left ?? { id: Number(row[association.leftKey]) })}</span></td><td className="association-link">↔</td><td><span className="entity-chip">{optionLabel(right ?? { id: Number(row[association.rightKey]) })}</span></td><td className="row-actions"><button className="icon-button danger-quiet" disabled={busy} title="Remove association" onClick={() => void remove(row)}><Icon name="unlink" /></button></td></tr>
      })}</tbody></table> : <EmptyState title="No relationships yet" detail="Add a relationship above to connect these records." />}</div>
    </section>
  </>
}

function ProfilePage({ profile, initialToken, onProfileChange, onNotify, onSignOut }: { profile: Profile; initialToken?: string; onProfileChange: (profile: Profile) => void; onNotify: (message: string, kind?: Notice['kind']) => void; onSignOut: () => Promise<void> }) {
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

function AuthScreen({ onSignedIn, sessionData, onDismissToken, notice, onNotice, onDismissNotice }: { onSignedIn: (session: SessionData) => Promise<void>; sessionData: SessionData | null; onDismissToken: () => void; notice: Notice | null; onNotice: (message: string, kind?: Notice['kind']) => void; onDismissNotice: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login')
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
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
      else if (mode === 'register') await onSignedIn(await api.register(username, email, password))
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
        {mode === 'register' && <><label className="field-label"><span>Username</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={50} required /></label><label className="field-label"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={100} required /></label><label className="field-label"><span>Password</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /><small className="helper-text">Use at least 8 characters.</small></label></>}
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

function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{children && <div className="heading-action">{children}</div>}</div>
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></header>{children}</section></div>
}

function DetailsDialog({ title, data, loading, onClose }: { title: string; data: Row; loading: boolean; onClose: () => void }) {
  return <Modal title={title} subtitle={loading ? 'Loading full record details…' : 'Full record details'} onClose={onClose}><dl className="details-list">{Object.entries(data).map(([key, value]) => <div key={key}><dt>{titleCase(key)}</dt><dd>{typeof value === 'object' && value !== null ? <pre>{JSON.stringify(value, null, 2)}</pre> : displayValue(value)}</dd></div>)}</dl><div className="form-actions"><button className="button button-secondary" onClick={onClose}>Close</button></div></Modal>
}

function ConfirmDialog({ title, message, busy, onCancel, onConfirm }: { title: string; message: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Modal title={title} subtitle={message} onClose={onCancel}><div className="form-actions"><button className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button className="button button-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : 'Confirm delete'}</button></div></Modal>
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="inbox" /></span><b>{title}</b><p>{detail}</p>{action && onAction && <button className="button button-secondary button-compact" onClick={onAction}>{action}</button>}</div>
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="inline-error" role="alert"><span>{message}</span><button className="text-button" onClick={onRetry}>Retry</button></div>
}

function LoadingRows() {
  return <div className="loading-rows" aria-label="Loading records"><span /><span /><span /><span /></div>
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const tone = ['completed', 'paid', 'success', 'active'].includes(normalized) ? 'green' : ['cancelled', 'failed', 'refunded'].includes(normalized) ? 'red' : normalized === 'pending' ? 'amber' : 'blue'
  return <span className={`status-pill ${tone}`}><i />{titleCase(status)}</span>
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 14 4-4 4 3 6-7" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <><path d="m16 4 4 4L8 20H4v-4L16 4Z" /><path d="m14 6 4 4" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7" /></>,
    unlink: <><path d="m10 13 4-4" /><path d="M7 17H5a4 4 0 0 1 0-8h4m6-2h4a4 4 0 0 1 0 8h-2" /><path d="m3 3 18 18" /></>,
    inbox: <><path d="M4 4h16l2 11h-6l-2 3h-4l-2-3H2L4 4Z" /><path d="M4 4h16" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.grid}</svg>
}

function iconForResource(key: string) {
  if (key === 'orders' || key === 'transactions' || key === 'order-items') return 'bag'
  if (key === 'products' || key === 'stock-items') return 'box'
  if (key === 'markets' || key === 'stores') return 'map'
  if (key === 'roles' || key === 'permissions' || key === 'admins' || key === 'audits') return 'shield'
  return 'layers'
}

function endpointForKey(key: string) {
  const fixed: Record<string, string> = { user_id: 'users', tenant_id: 'tenants', market_id: 'markets', store_id: 'stores', product_id: 'products', order_id: 'orders', role_id: 'roles', permission_id: 'permissions', category_id: 'categories' }
  return fixed[key]
}

async function loadOptions(endpoint: string): Promise<Row[]> {
  if (endpoint === 'users') {
    const profile = await api.request<Profile>('/users/me')
    return [{ ...profile, id: profile.id }]
  }
  return (await api.list<Row>(endpoint, { limit: 100, sort: 'id', order: 'asc' })).data
}

function optionLabel(item: Row) {
  const label = item.name ?? item.username ?? item.email
  return `${label ? String(label) : `Record #${item.id}`} · #${item.id}`
}

function cellFor(resource: ResourceSpec, column: string, value: unknown) {
  if (column === 'id') return <span className="id-cell">#{displayValue(value)}</span>
  if (column === 'created_at') return <span className="date-cell">{prettyDate(value)}</span>
  if (column === 'status') return <StatusPill status={String(value ?? 'unknown')} />
  if (column === 'price' || column === 'total' || column === 'amount') return <span className="strong">{currency(value)}</span>
  const field = resource.fields.find((item) => item.name === column)
  if (field?.optionsFrom && value !== null && value !== undefined) return <span className="reference-cell">{endpointLabel(field.optionsFrom)} #{displayValue(value)}</span>
  if (column === 'body' && typeof value === 'object') return <code>{JSON.stringify(value)}</code>
  const text = displayValue(value)
  return <span className="cell-truncate" title={text}>{text}</span>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export default App

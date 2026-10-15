import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { currency, displayValue, errorMessage, prettyDate } from '../utils'
import type { Company, Profile, Row } from '../types'
import { EmptyState, Icon, LoadingRows, StatusPill } from './common'

export function Dashboard({ profile, onNavigate, onError }: { profile: Profile; onNavigate: (section: string) => void; onError: (message: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [stats, setStats] = useState({ orders: 0, sales: 0, products: 0, stock: 0, lowStock: 0, pending: 0 })
  const [latestOrders, setLatestOrders] = useState<Row[]>([])
  const [lowStockItems, setLowStockItems] = useState<Row[]>([])

  const reload = useCallback(async () => {
    setLoading(true)
    const endpoints = ['orders', 'payments', 'products', 'stock-items'] as const
    const results = await Promise.allSettled(endpoints.map((endpoint) => api.list<Row>(endpoint, { limit: 100, sort: 'id', order: 'desc' })))
    const failures = results.filter((result) => result.status === 'rejected')
    const records = Object.fromEntries(endpoints.map((endpoint, index) => [
      endpoint,
      results[index].status === 'fulfilled' ? results[index].value.data : [],
    ])) as Record<(typeof endpoints)[number], Row[]>
    const orders = records.orders
    const payments = records.payments
    const inventory = records['stock-items']
    setStats({
      orders: results[0].status === 'fulfilled' ? results[0].value.pagination.total : orders.length,
      sales: payments.filter((payment) => payment.status === 'completed').reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      products: results[2].status === 'fulfilled' ? results[2].value.pagination.total : records.products.length,
      stock: inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      lowStock: inventory.filter((item) => Number(item.quantity || 0) <= 5).length,
      pending: orders.filter((order) => String(order.status).toLowerCase() === 'draft').length,
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
        <Metric label="Total sales" value={loading ? '—' : stats.orders.toLocaleString()} note={`${stats.pending} draft sales`} icon="bag" tone="blue" />
        <Metric label="Captured payments · latest 100" value={loading ? '—' : currency(stats.sales)} note="Completed payment records in the latest page" icon="chart" tone="green" />
        <Metric label="Active products" value={loading ? '—' : stats.products.toLocaleString()} note="Catalog items available" icon="box" tone="violet" />
        <Metric label="Units · latest 100 stock rows" value={loading ? '—' : stats.stock.toLocaleString()} note={`${stats.lowStock} rows at or below 5 units`} icon="layers" tone="amber" />
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading"><div><h2>Recent sales</h2><p>Your latest completed transactions</p></div><button className="text-button" onClick={() => onNavigate('orders')}>View all <span>→</span></button></div>
          {loading ? <LoadingRows /> : latestOrders.length ? <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Store</th><th>Sold</th><th>Total</th><th>Status</th></tr></thead><tbody>{latestOrders.map((order) => <tr key={order.id}><td><button className="id-link" onClick={() => onNavigate('orders')}>{displayValue(order.receipt_number)}</button></td><td>Store #{displayValue(order.store_id)}</td><td>{prettyDate(order.sold_at)}</td><td className="strong">{currency(order.total)}</td><td><StatusPill status={String(order.status)} /></td></tr>)}</tbody></table></div> : <EmptyState title="No sales yet" detail="Completed sales will appear here." action="View sales" onAction={() => onNavigate('orders')} /> }
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Inventory watch</h2><p>Latest inventory rows with 5 units or fewer</p></div><button className="text-button" onClick={() => onNavigate('stock-items')}>Inventory <span>→</span></button></div>
          {loading ? <LoadingRows /> : lowStockItems.length ? <div className="watch-list">{lowStockItems.map((item) => <div className="watch-item" key={item.id}><span className="watch-icon"><Icon name="box" /></span><span className="watch-name"><b>Product #{displayValue(item.product_id)}</b><small>Store #{displayValue(item.store_id)}</small></span><span className={`stock-count ${Number(item.quantity) === 0 ? 'out' : ''}`}>{displayValue(item.quantity)} left</span></div>)}</div> : <EmptyState title="Stock looks healthy" detail="No inventory is at the low-stock threshold." action="View inventory" onAction={() => onNavigate('stock-items')} /> }
        </section>
      </div>
      <section className="quick-actions"><div><h2>Quick access</h2><p>Jump into your most-used tools</p></div><div className="quick-action-list">
        {[['products', 'Add product', 'box'], ['employees', 'Manage employees', 'user'], ['locations', 'Manage locations', 'map'], ['transactions', 'Record finance', 'chart']].map(([target, label, icon]) => <button key={target} className="quick-action" onClick={() => onNavigate(target)}><span className="quick-icon"><Icon name={icon} /></span><span>{label}</span><b>→</b></button>)}
      </div></section>
    </>
  )
}

export function CompanySetup({ onCreated, onError }: { onCreated: (company: Company) => void; onError: (message: string) => void }) {
  const [name, setName] = useState('')
  const [companyCurrency, setCompanyCurrency] = useState('MWK')
  const [busy, setBusy] = useState(false)
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const company = await api.request<Company>('/users/me/tenants', { method: 'POST', body: JSON.stringify({ name, currency: companyCurrency }) })
      onCreated(company)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return <section className="company-setup panel"><div className="eyebrow">COMPANY WORKSPACE</div><h1>Set up your company</h1><p className="page-subtitle">Create the company workspace where you’ll manage locations, employees, stock, sales, and finances.</p><form className="resource-form" onSubmit={(event) => void create(event)}><label className="field-label"><span>Company name *</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label><label className="field-label"><span>Operating currency</span><select value={companyCurrency} onChange={(event) => setCompanyCurrency(event.target.value)}><option value="MWK">MWK · Malawi Kwacha</option><option value="USD">USD · US Dollar</option><option value="ZAR">ZAR · South African Rand</option><option value="GBP">GBP · Pound Sterling</option><option value="EUR">EUR · Euro</option></select></label><button className="button button-primary" disabled={busy}>{busy ? 'Setting up…' : 'Create company workspace'}</button></form></section>
}

function Metric({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: string; tone: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon name={icon} /></span></div><strong>{value}</strong><small>{note}</small></div>
}

export function iconForResource(key: string) {
  if (key === 'orders' || key === 'transactions' || key === 'order-items' || key === 'payments') return 'bag'
  if (key === 'products' || key === 'stock-items' || key === 'inventory-movements' || key === 'categories') return 'box'
  if (key === 'markets' || key === 'stores' || key === 'locations') return 'map'
  if (key === 'employees') return 'user'
  if (key === 'roles' || key === 'permissions' || key === 'admins' || key === 'audits') return 'shield'
  return 'layers'
}

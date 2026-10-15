import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, type PageResult } from '../../api'
import { endpointLabel, type FieldSpec, type ResourceSpec } from '../../data'
import { currency, displayValue, errorMessage, prettyDate, titleCase } from '../../utils'
import type { Notice, Profile, Row } from '../../types'
import { ConfirmDialog, DetailsDialog, EmptyState, Icon, InlineError, LoadingRows, Modal, StatusPill } from '../common'

export function ResourcePage({ resource, onNotify }: { resource: ResourceSpec; onNotify: (message: string, kind?: Notice['kind']) => void }) {
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
  const [saleOpen, setSaleOpen] = useState(false)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)

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
    const dateField = resource.fields.find((item) => ['created_at', 'updated_at', 'sold_at', 'paid_at', 'occurred_at', 'hired_at'].includes(item.name))?.name ?? 'created_at'
    const first = resource.fields.map((item) => item.name).filter((name) => name !== dateField).slice(0, 4)
    return ['id', ...first, dateField]
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
  const saveSale = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await api.request('/sales', { method: 'POST', body: JSON.stringify(body) })
      onNotify('Sale recorded. Stock, payments, finance, and audit records were updated.')
      setSaleOpen(false)
      await load()
    } catch (err) {
      onNotify(errorMessage(err), 'error')
      throw err
    } finally {
      setBusy(false)
    }
  }
  const saveAdjustment = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await api.request('/stock-adjustments', { method: 'POST', body: JSON.stringify(body) })
      onNotify('Stock adjusted and movement recorded.')
      setAdjustmentOpen(false)
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
        {resource.key === 'orders'
          ? <button className="button button-primary" onClick={() => setSaleOpen(true)}><Icon name="plus" />Record sale</button>
          : resource.key === 'stock-items'
            ? <button className="button button-primary" onClick={() => setAdjustmentOpen(true)}><Icon name="plus" />Adjust stock</button>
          : !resource.readOnly && <button className="button button-primary" onClick={() => setEditing(null)}><Icon name="plus" />Add {resource.singular.toLowerCase()}</button>}
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
          <td className="row-actions"><button className="icon-button" title="View details" onClick={() => void openDetails(row)}><Icon name="eye" /></button>{!resource.readOnly && <button className="icon-button" title={`Edit ${resource.singular}`} onClick={() => setEditing(row)}><Icon name="edit" /></button>}{!resource.readOnly && !resource.deletionDisabled && <button className="icon-button danger-quiet" title={`Delete ${resource.singular}`} onClick={() => setPendingDelete(row)}><Icon name="trash" /></button>}</td>
          </tr>)}</tbody></table> : <EmptyState title={error ? 'Records could not be loaded' : 'Nothing here yet'} detail={error ? 'Retry the request, or check your access to this resource.' : `No ${resource.label.toLowerCase()} match this view.`} action={error ? 'Retry' : resource.readOnly ? undefined : `Add ${resource.singular.toLowerCase()}`} onAction={error ? () => void load() : () => setEditing(null)} />}
        </div>
        <div className="pagination"><div className="pagination-summary"><span>{result?.pagination.total ? `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, result.pagination.total)} of ${result.pagination.total}` : 'No records'}</span><label className="page-size">Rows <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1) }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div><div><button className="button button-secondary button-compact" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>← Previous</button><span className="page-indicator">Page {page}{result?.pagination.total ? ` of ${Math.max(1, Math.ceil(result.pagination.total / limit))}` : ''}</span><button className="button button-secondary button-compact" disabled={loading || !result || page * limit >= result.pagination.total} onClick={() => setPage((value) => value + 1)}>Next →</button></div></div>
      </section>
      {editing !== false && <ResourceForm resource={resource} initial={editing || undefined} busy={busy} onClose={() => setEditing(false)} onSubmit={save} />}
      {saleOpen && <SaleDialog busy={busy} onClose={() => setSaleOpen(false)} onSubmit={saveSale} />}
      {adjustmentOpen && <StockAdjustmentDialog busy={busy} onClose={() => setAdjustmentOpen(false)} onSubmit={saveAdjustment} />}
      {viewing && <DetailsDialog title={`${resource.singular} #${viewing.id}`} data={viewing} loading={loadingDetail} onClose={() => setViewing(null)} />}
      {pendingDelete && <ConfirmDialog title={`Delete ${resource.singular.toLowerCase()}?`} message={`This will permanently delete record #${pendingDelete.id}. This action cannot be undone.`} busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />}
    </>
  )
}

function StockAdjustmentDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [stores, setStores] = useState<Row[]>([])
  const [products, setProducts] = useState<Row[]>([])
  const [employees, setEmployees] = useState<Row[]>([])
  const [storeId, setStoreId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantityDelta, setQuantityDelta] = useState('')
  const [movementType, setMovementType] = useState('adjustment')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([
      api.list<Row>('stores', { limit: 100, sort: 'name', order: 'asc' }),
      api.list<Row>('products', { limit: 100, sort: 'name', order: 'asc' }),
      api.list<Row>('employees', { limit: 100, sort: 'first_name', order: 'asc', employment_status: 'active' }),
    ]).then(([storeResult, productResult, employeeResult]) => {
      setStores(storeResult.data)
      setProducts(productResult.data)
      setEmployees(employeeResult.data)
    }).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSubmit({ store_id: Number(storeId), product_id: Number(productId), quantity_delta: Number(quantityDelta), movement_type: movementType, note })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Adjust stock" subtitle="Every change is recorded in the inventory movement history and audit trail." onClose={onClose}>
    <form className="resource-form" onSubmit={(event) => void submit(event)}>
      <label className="field-label"><span>Store *</span><select value={storeId} onChange={(event) => setStoreId(event.target.value)} required><option value="">Select a store…</option>{stores.map((store) => <option key={store.id} value={store.id}>{optionLabel(store)}</option>)}</select></label>
      <label className="field-label"><span>Product *</span><select value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">Select a product…</option>{products.map((product) => <option key={product.id} value={product.id}>{optionLabel(product)}</option>)}</select></label>
      <label className="field-label"><span>Quantity change *</span><input type="number" step="1" value={quantityDelta} onChange={(event) => setQuantityDelta(event.target.value)} placeholder="Use a negative number to remove stock" required /></label>
      <label className="field-label"><span>Reason *</span><select value={movementType} onChange={(event) => setMovementType(event.target.value)}><option value="opening">Opening stock</option><option value="purchase">Received purchase</option><option value="return">Customer return</option><option value="transfer_in">Transfer in</option><option value="transfer_out">Transfer out</option><option value="adjustment">Count correction</option><option value="damage">Damaged stock</option></select></label>
      <label className="field-label"><span>Note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={saving || busy || stores.length === 0 || products.length === 0 || !Number(quantityDelta)}>{saving || busy ? 'Saving…' : 'Save adjustment'}</button></div>
    </form>
  </Modal>
}

function SaleDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [stores, setStores] = useState<Row[]>([])
  const [products, setProducts] = useState<Row[]>([])
  const [employees, setEmployees] = useState<Row[]>([])
  const [storeId, setStoreId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [receipt, setReceipt] = useState(`R-${Date.now()}`)
  const [method, setMethod] = useState('cash')
  const [lines, setLines] = useState([{ productId: '', quantity: '1' }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([
      api.list<Row>('stores', { limit: 100, sort: 'name', order: 'asc' }),
      api.list<Row>('products', { limit: 100, sort: 'name', order: 'asc' }),
      api.list<Row>('employees', { limit: 100, sort: 'first_name', order: 'asc', employment_status: 'active' }),
    ]).then(([storeResult, productResult, employeeResult]) => {
      setStores(storeResult.data)
      setProducts(productResult.data)
      setEmployees(employeeResult.data)
    }).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const total = lines.reduce((sum, line) => {
    const product = products.find((item) => String(item.id) === line.productId)
    const quantity = Number(line.quantity)
    return sum + (product ? Number(product.price) * (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0) : 0)
  }, 0)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const items = lines.map((line) => ({ product_id: Number(line.productId), quantity: Number(line.quantity) }))
      await onSubmit({
        store_id: Number(storeId),
        ...(employeeId ? { employee_id: Number(employeeId) } : {}),
        receipt_number: receipt.trim(),
        items,
        payments: [{ amount: total.toFixed(2), method }],
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Record a sale" subtitle="The sale will update stock, payment records, finance, and the audit trail together." onClose={onClose}>
    <form className="resource-form" onSubmit={(event) => void submit(event)}>
      <label className="field-label"><span>Store *</span><select value={storeId} onChange={(event) => setStoreId(event.target.value)} required><option value="">Select a store…</option>{stores.map((store) => <option key={store.id} value={store.id}>{optionLabel(store)}</option>)}</select></label>
      <label className="field-label"><span>Cashier / employee</span><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Not assigned</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_number}</option>)}</select></label>
      <label className="field-label"><span>Receipt number *</span><input value={receipt} onChange={(event) => setReceipt(event.target.value)} maxLength={80} required /></label>
      <div className="sale-lines"><div className="panel-heading"><div><h2>Items</h2><p>Prices are taken from the company catalog.</p></div><button type="button" className="button button-secondary button-compact" onClick={() => setLines((current) => [...current, { productId: '', quantity: '1' }])}>Add line</button></div>
        {lines.map((line, index) => <div className="sale-line" key={index}><label className="field-label"><span>Product *</span><select value={line.productId} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: event.target.value } : item))} required><option value="">Select a product…</option>{products.map((product) => <option key={product.id} value={product.id}>{optionLabel(product)} · {currency(product.price)}</option>)}</select></label><label className="field-label"><span>Qty *</span><input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} required /></label>{lines.length > 1 && <button type="button" className="icon-button danger-quiet" aria-label="Remove sale line" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Icon name="trash" /></button>}</div>)}
      </div>
      <label className="field-label"><span>Payment method *</span><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option></select></label>
      <div className="sale-total"><span>Sale total</span><strong>{currency(total)}</strong></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={saving || busy || stores.length === 0 || products.length === 0 || total <= 0}>{saving || busy ? 'Recording…' : 'Complete sale'}</button></div>
    </form>
  </Modal>
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
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(resource.fields.map((item) => [item.name, fieldInitialValue(item, initial?.[item.name])])))
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
        } else if (item.kind === 'datetime') {
          const date = new Date(value)
          if (Number.isNaN(date.valueOf())) throw new Error(`${item.label} must be a valid date and time.`)
          body[item.name] = date.toISOString()
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

function fieldInitialValue(field: FieldSpec, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (field.kind === 'date') return String(value).slice(0, 10)
  if (field.kind === 'datetime') {
    const date = new Date(String(value))
    if (Number.isNaN(date.valueOf())) return String(value).slice(0, 16)
    return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  return String(value)
}

export function FieldInput({ field, value, options, onChange }: { field: FieldSpec; value: string; options: Row[]; onChange: (value: string) => void }) {
  const common = { id: `field-${field.name}`, name: field.name, value, required: field.required, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) }
  const inputType = field.name === 'password' ? 'password' : field.name === 'email' ? 'email' : field.kind === 'number' || field.kind === 'money' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'datetime' ? 'datetime-local' : 'text'
  return <label className="field-label" htmlFor={common.id}><span>{field.label}{field.required && <i> *</i>}</span>{field.kind === 'textarea' || field.kind === 'json'
    ? <textarea {...common} rows={field.kind === 'json' ? 5 : 3} placeholder={field.kind === 'json' ? '{\n  "key": "value"\n}' : `Enter ${field.label.toLowerCase()}`} />
    : field.kind === 'select'
      ? <select {...common}><option value="">Select {field.label.toLowerCase()}…</option>{field.values?.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}{field.optionsFrom && options.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select>
    : field.kind === 'suggestion'
      ? <><input {...common} list={`suggestions-${field.name}`} placeholder={`Enter ${field.label.toLowerCase()}`} /><datalist id={`suggestions-${field.name}`}>{field.values?.map((item) => <option key={item} value={item} />)}</datalist></>
      : <input {...common} type={inputType} step={field.step ?? (field.kind === 'money' ? '0.01' : field.kind === 'number' ? '1' : undefined)} placeholder={field.kind === 'money' ? '0.00' : `Enter ${field.label.toLowerCase()}`} />}</label>
}

function endpointForKey(key: string) {
  const fixed: Record<string, string> = { user_id: 'users', tenant_id: 'tenants', market_id: 'markets', location_id: 'locations', store_id: 'stores', product_id: 'products', order_id: 'orders', employee_id: 'employees', role_id: 'roles', permission_id: 'permissions', category_id: 'categories' }
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

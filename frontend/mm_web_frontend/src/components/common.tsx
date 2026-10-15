import { useEffect, type ReactNode } from 'react'
import { displayValue, titleCase } from '../utils'
import type { Row } from '../types'

export function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{children && <div className="heading-action">{children}</div>}</div>
}

export function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></header>{children}</section></div>
}

export function DetailsDialog({ title, data, loading, onClose }: { title: string; data: Row; loading: boolean; onClose: () => void }) {
  return <Modal title={title} subtitle={loading ? 'Loading full record details…' : 'Full record details'} onClose={onClose}><dl className="details-list">{Object.entries(data).map(([key, value]) => <div key={key}><dt>{titleCase(key)}</dt><dd>{typeof value === 'object' && value !== null ? <pre>{JSON.stringify(value, null, 2)}</pre> : displayValue(value)}</dd></div>)}</dl><div className="form-actions"><button className="button button-secondary" onClick={onClose}>Close</button></div></Modal>
}

export function ConfirmDialog({ title, message, busy, onCancel, onConfirm }: { title: string; message: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Modal title={title} subtitle={message} onClose={onCancel}><div className="form-actions"><button className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button className="button button-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : 'Confirm delete'}</button></div></Modal>
}

export function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="inbox" /></span><b>{title}</b><p>{detail}</p>{action && onAction && <button className="button button-secondary button-compact" onClick={onAction}>{action}</button>}</div>
}

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="inline-error" role="alert"><span>{message}</span><button className="text-button" onClick={onRetry}>Retry</button></div>
}

export function LoadingRows() {
  return <div className="loading-rows" aria-label="Loading records"><span /><span /><span /><span /></div>
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const tone = ['completed', 'paid', 'success', 'active'].includes(normalized) ? 'green' : ['cancelled', 'failed', 'refunded'].includes(normalized) ? 'red' : normalized === 'pending' ? 'amber' : 'blue'
  return <span className={`status-pill ${tone}`}><i />{titleCase(status)}</span>
}

export function Icon({ name }: { name: string }) {
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

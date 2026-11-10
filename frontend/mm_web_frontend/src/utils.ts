export const prettyDate = (value: unknown) => {
  if (!value) return '—'
  const date = new Date(String(value))
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
export const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const kwacha = new Intl.NumberFormat('en-MW', { style: 'currency', currency: 'MWK' })
export const currency = (value: unknown) => kwacha.format(Number(value) || 0)
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export function iconForResource(key: string) {
  if (key === 'orders' || key === 'transactions' || key === 'order-items' || key === 'payments') return 'bag'
  if (key === 'products' || key === 'stock-items' || key === 'inventory-movements' || key === 'categories') return 'box'
  if (key === 'markets' || key === 'stores' || key === 'locations') return 'map'
  if (key === 'employees') return 'user'
  if (key === 'roles' || key === 'permissions' || key === 'admins' || key === 'audits') return 'shield'
  return 'layers'
}

export const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

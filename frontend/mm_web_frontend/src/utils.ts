import { api } from './api'

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
export const currency = (value: unknown) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: api.activeCurrency }).format(Number(value) || 0) }
  catch { return `${api.activeCurrency} ${Number(value || 0).toFixed(2)}` }
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

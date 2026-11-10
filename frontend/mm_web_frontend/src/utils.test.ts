import { describe, expect, it } from 'vitest'
import { currency, displayValue, errorMessage, iconForResource, prettyDate, titleCase } from './utils'

describe('utils', () => {
  it('title-cases snake_case names', () => {
    expect(titleCase('store_id')).toBe('Store Id')
    expect(titleCase('sold_at')).toBe('Sold At')
  })

  it('displays empty values as a dash and objects as JSON', () => {
    expect(displayValue(null)).toBe('—')
    expect(displayValue(undefined)).toBe('—')
    expect(displayValue('')).toBe('—')
    expect(displayValue(0)).toBe('0')
    expect(displayValue({ a: 1 })).toBe('{"a":1}')
  })

  it('formats dates and tolerates invalid input', () => {
    expect(prettyDate(null)).toBe('—')
    expect(prettyDate('not a date')).toBe('not a date')
    expect(prettyDate('2026-01-15T10:00:00Z')).toMatch(/2026/)
  })

  it('formats amounts in Malawi Kwacha and survives bad values', () => {
    expect(currency('12500.5')).toMatch(/MWK|MK/)
    expect(currency('12500.5')).toMatch(/12,500\.50/)
    expect(currency('abc')).toMatch(/0\.00/)
    expect(currency(null)).toMatch(/0\.00/)
  })

  it('extracts error messages', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('nope')).toBe('An unexpected error occurred.')
  })

  it('maps resources to icons', () => {
    expect(iconForResource('orders')).toBe('bag')
    expect(iconForResource('stock-items')).toBe('box')
    expect(iconForResource('audits')).toBe('shield')
    expect(iconForResource('unknown')).toBe('layers')
  })
})

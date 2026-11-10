import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const page = (data: unknown[]) => ({ data, pagination: { page: 1, limit: 100, total: data.length } })

function mockApi(overrides: Record<string, () => Response> = {}) {
  const routes: Record<string, () => Response> = {
    '/api/auth/login': () => json({ accessToken: 'a', refreshToken: 'r' }),
    '/api/users/me/tenants': () => json({ data: [{ id: 1, name: 'Northstar' }] }),
    '/api/users/me': () => json({ id: 1, username: 'demo', email: 'demo@x.test', email_verified: true, created_at: '2026-01-01T00:00:00Z' }),
    '/api/access': () => json({ isAdmin: true, roles: [], employee: null, storeIds: null, permissions: Object.fromEntries(['orders', 'payments', 'products', 'stock-items', 'employees', 'locations', 'transactions'].map((key) => [key, { read: true, write: true }])) }),
    '/api/health': () => json({ status: 'ok' }),
    '/api/orders': () => json(page([{ id: 1, receipt_number: 'R-1', store_id: 1, total: '10.00', status: 'completed', sold_at: '2026-01-01T00:00:00Z' }])),
    '/api/payments': () => json(page([{ id: 1, amount: '10.00', status: 'completed' }])),
    '/api/products': () => json(page([{ id: 1, name: 'Tea', price: '2.00' }])),
    '/api/stock-items': () => json(page([{ id: 1, product_id: 1, store_id: 1, quantity: 2 }])),
    ...overrides,
  }
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = String(input).split('?')[0]
    const handler = routes[path]
    return handler ? handler() : json({ message: `Unmocked ${path}` }, 404)
  }))
}

describe('App', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('shows the sign-in screen when signed out', () => {
    mockApi()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  })

  it('shows an error for bad credentials', async () => {
    mockApi({ '/api/auth/login': () => json({ message: 'Invalid credentials' }, 401) })
    render(<App />)
    await userEvent.type(screen.getByLabelText('Username or email'), 'demo@x.test')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid credentials')
  })

  it('signs in and renders the dashboard with the real weekday', async () => {
    mockApi()
    render(<App />)
    await userEvent.type(screen.getByLabelText('Username or email'), 'demo@x.test')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/Good to see you, demo/)).toBeTruthy()
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date()).toUpperCase()
    expect(document.querySelector('.welcome-row .eyebrow')?.textContent).toContain(weekday)
    await waitFor(() => expect(screen.getByText(/operational/)).toBeTruthy())
  })

  it('restores a stored session on load', async () => {
    localStorage.setItem('marketmesh.access', 'a')
    localStorage.setItem('marketmesh.refresh', 'r')
    mockApi()
    render(<App />)
    expect(await screen.findByText(/Good to see you, demo/)).toBeTruthy()
  })

  it('returns to sign-in when the session can no longer be renewed', async () => {
    localStorage.setItem('marketmesh.access', 'a')
    localStorage.setItem('marketmesh.refresh', 'r')
    mockApi()
    render(<App />)
    await screen.findByText(/Good to see you, demo/)
    mockApi({
      '/api/orders': () => json({ message: 'expired' }, 401),
      '/api/payments': () => json({ message: 'expired' }, 401),
      '/api/products': () => json({ message: 'expired' }, 401),
      '/api/stock-items': () => json({ message: 'expired' }, 401),
      '/api/auth/refresh-token': () => json({ message: 'revoked' }, 401),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh data' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  })

  it('shows an employee only the sections their role allows', async () => {
    localStorage.setItem('marketmesh.access', 'a')
    localStorage.setItem('marketmesh.refresh', 'r')
    mockApi({
      '/api/access': () => json({ isAdmin: false, roles: ['cashier'], employee: { id: 2, firstName: 'Mphatso', lastName: 'Phiri', employeeNumber: 'EMP-002' }, storeIds: [1], permissions: {
        orders: { read: true, write: false }, products: { read: true, write: false }, 'stock-items': { read: true, write: false }, sales: { read: false, write: true },
        transactions: { read: false, write: false }, employees: { read: false, write: false }, payments: { read: false, write: false },
      } }),
    })
    render(<App />)
    await screen.findByText(/Good to see you/)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav.textContent).toContain('Sales')
    expect(nav.textContent).toContain('Products')
    expect(nav.textContent).not.toContain('Finance')
    expect(nav.textContent).not.toContain('Employees')
    expect(nav.textContent).not.toContain('Payments')
    expect(document.querySelector('.workspace-pill small')?.textContent).toBe('cashier')
  })
})

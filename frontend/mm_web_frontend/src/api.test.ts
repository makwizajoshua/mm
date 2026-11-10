import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, SESSION_EXPIRED_EVENT } from './api'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('ApiClient', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('sends bearer token and tenant headers', async () => {
    localStorage.setItem('marketmesh.access', 'tok')
    api.setActiveTenant(7)
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [], pagination: { page: 1, limit: 10, total: 0 } }))
    vi.stubGlobal('fetch', fetchMock)
    await api.list('products', { page: 1, search: '', sort: 'id' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/products?page=1&sort=id')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok')
    expect((init.headers as Headers).get('X-Tenant-Id')).toBe('7')
  })

  it('reports an unreachable API clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(api.request('/health')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('Unable to reach') })
  })

  it('surfaces server error messages and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Receipt already used' }, 409)))
    await expect(api.request('/sales')).rejects.toMatchObject({ status: 409, message: 'Receipt already used' })
  })

  it('refreshes once on 401 and retries the request', async () => {
    localStorage.setItem('marketmesh.access', 'old')
    localStorage.setItem('marketmesh.refresh', 'r1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: 'expired' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'new', refreshToken: 'r2' }))
      .mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.request('/users/me')).resolves.toEqual({ ok: true })
    expect(localStorage.getItem('marketmesh.access')).toBe('new')
    expect(localStorage.getItem('marketmesh.refresh')).toBe('r2')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('clears the session and announces expiry when refresh fails', async () => {
    localStorage.setItem('marketmesh.access', 'old')
    localStorage.setItem('marketmesh.refresh', 'bad')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'nope' }, 401)))
    const expired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, expired)
    await expect(api.request('/users/me')).rejects.toMatchObject({ status: 401 })
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired)
    expect(expired).toHaveBeenCalledOnce()
    expect(api.authenticated).toBe(false)
  })

  it('logs in with email or username', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ accessToken: 'a', refreshToken: 'b' }))
    vi.stubGlobal('fetch', fetchMock)
    await api.login('me@x.test', 'pw')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'me@x.test', password: 'pw' })
    await api.login('me', 'pw')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ username: 'me', password: 'pw' })
  })

  it('rejects invalid stored tenant ids', () => {
    localStorage.setItem('marketmesh.tenant', 'abc')
    expect(api.activeTenantId).toBeNull()
  })
})

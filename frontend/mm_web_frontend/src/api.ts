const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const ACCESS_KEY = 'marketmesh.access'
const REFRESH_KEY = 'marketmesh.refresh'
const TENANT_KEY = 'marketmesh.tenant'
const CURRENCY_KEY = 'marketmesh.currency'

export interface PageResult<T> {
  data: T[]
  pagination: { page: number; limit: number; total: number }
}

export interface ApiError extends Error {
  status: number
}

export interface SessionData {
  accessToken: string
  refreshToken: string
  user?: { id: number; username: string; email: string; email_verified?: boolean }
  emailVerificationToken?: string
}

class ApiClient {
  private refreshInFlight: Promise<SessionData> | null = null

  get authenticated() {
    return Boolean(localStorage.getItem(ACCESS_KEY))
  }

  async request<T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
    const headers = new Headers(options.headers)
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const accessToken = localStorage.getItem(ACCESS_KEY)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    const tenantId = localStorage.getItem(TENANT_KEY)
    if (tenantId) headers.set('X-Tenant-Id', tenantId)
    let response: Response
    try {
      response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, { ...options, headers })
    } catch {
      throw apiError('Unable to reach the API. Check that the backend is running.', 0)
    }

    if (response.status === 401 && allowRefresh && localStorage.getItem(REFRESH_KEY) && !path.startsWith('/auth/')) {
      try {
        await this.renewSession()
        return this.request<T>(path, options, false)
      } catch {
        this.clearSession()
      }
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null
      throw apiError(payload?.message || `Request failed (${response.status})`, response.status)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  async login(identifier: string, password: string) {
    const result = await this.request<SessionData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(identifier.includes('@') ? { email: identifier, password } : { username: identifier, password }),
    })
    this.saveSession(result)
    return result
  }

  async register(username: string, email: string, password: string, companyName: string, companyCurrency = 'MWK') {
    const result = await this.request<SessionData>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, companyName, companyCurrency }),
    })
    this.saveSession(result)
    return result
  }

  async refresh() {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) throw apiError('Your session has expired. Please sign in again.', 401)
    const result = await this.request<SessionData>('/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, false)
    this.saveSession(result)
    return result
  }

  private renewSession() {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refresh().finally(() => {
        this.refreshInFlight = null
      })
    }
    return this.refreshInFlight
  }

  async logout() {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    try {
      if (refreshToken) await this.request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false)
    } finally {
      this.clearSession()
    }
  }

  saveSession(session: SessionData) {
    localStorage.setItem(ACCESS_KEY, session.accessToken)
    localStorage.setItem(REFRESH_KEY, session.refreshToken)
  }

  clearSession() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(TENANT_KEY)
    localStorage.removeItem(CURRENCY_KEY)
  }

  setActiveTenant(tenantId: number | null, currency = 'MWK') {
    if (tenantId === null) {
      localStorage.removeItem(TENANT_KEY)
      localStorage.removeItem(CURRENCY_KEY)
    } else {
      localStorage.setItem(TENANT_KEY, String(tenantId))
      localStorage.setItem(CURRENCY_KEY, currency)
    }
  }

  get activeTenantId() {
    const tenantId = Number(localStorage.getItem(TENANT_KEY))
    return Number.isSafeInteger(tenantId) && tenantId > 0 ? tenantId : null
  }

  get activeCurrency() {
    return localStorage.getItem(CURRENCY_KEY) || 'MWK'
  }

  list<T>(endpoint: string, params: Record<string, string | number | undefined> = {}) {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') query.set(key, String(value))
    })
    return this.request<PageResult<T>>(`/${endpoint}${query.size ? `?${query}` : ''}`)
  }

  get<T>(endpoint: string, id: string | number) {
    return this.request<T>(`/${endpoint}/${id}`)
  }

  create<T>(endpoint: string, body: Record<string, unknown>) {
    return this.request<T>(`/${endpoint}`, { method: 'POST', body: JSON.stringify(body) })
  }

  update<T>(endpoint: string, id: string | number, body: Record<string, unknown>) {
    return this.request<T>(`/${endpoint}/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  }

  remove<T>(endpoint: string, id: string | number) {
    return this.request<T>(`/${endpoint}/${id}`, { method: 'DELETE' })
  }
}

function apiError(message: string, status: number): ApiError {
  return Object.assign(new Error(message), { status })
}

export const api = new ApiClient()

export type Row = Record<string, unknown> & { id: number }
export type Profile = { id: number; username: string; email: string; email_verified: boolean; created_at: string; updated_at?: string }
export type Company = { id: number; name: string; currency: string }
export type Notice = { kind: 'success' | 'error'; message: string }

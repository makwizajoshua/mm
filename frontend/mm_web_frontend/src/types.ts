export type Row = Record<string, unknown> & { id: number }
export type Profile = { id: number; username: string; email: string; email_verified: boolean; created_at: string; updated_at?: string }
export type Company = { id: number; name: string }
export type Access = {
  isAdmin: boolean
  roles: string[]
  employee: { id: number; firstName: string; lastName: string; employeeNumber: string } | null
  storeIds: number[] | null
  permissions: Record<string, { read: boolean; write: boolean }>
}
export type Notice = { kind: 'success' | 'error'; message: string }

export type FieldKind = 'text' | 'number' | 'money' | 'textarea' | 'json' | 'select' | 'suggestion'

export interface FieldSpec {
  name: string
  label: string
  kind?: FieldKind
  required?: boolean
  optionsFrom?: string
  values?: string[]
  step?: string
}

export interface ResourceSpec {
  key: string
  label: string
  singular: string
  endpoint: string
  description: string
  group: string
  fields: FieldSpec[]
  sortableFields: string[]
  filters?: string[]
  searchable?: boolean
  readOnly?: boolean
}

const field = (name: string, label: string, kind: FieldKind = 'text', extra: Partial<FieldSpec> = {}): FieldSpec =>
  ({ name, label, kind, ...extra })
const foreign = (name: string, label: string, endpoint: string, required = true): FieldSpec =>
  field(name, label, 'select', { optionsFrom: endpoint, required })

export const resources: ResourceSpec[] = [
  { key: 'orders', label: 'Orders', singular: 'Order', endpoint: 'orders', description: 'Customer purchases and fulfillment status.', group: 'Commerce', searchable: false, filters: ['user_id', 'store_id', 'status'], sortableFields: ['id', 'user_id', 'store_id', 'total', 'status', 'created_at'], fields: [foreign('user_id', 'Customer', 'users', false), foreign('store_id', 'Store', 'stores'), field('total', 'Order total', 'money', { required: true }), field('status', 'Status', 'suggestion', { required: true, values: ['pending', 'processing', 'completed', 'cancelled', 'refunded'] })] },
  { key: 'order-items', label: 'Order items', singular: 'Order item', endpoint: 'order-items', description: 'Products and quantities attached to each order.', group: 'Commerce', filters: ['order_id', 'product_id'], sortableFields: ['id', 'order_id', 'product_id', 'quantity', 'price', 'created_at'], fields: [foreign('order_id', 'Order', 'orders'), foreign('product_id', 'Product', 'products'), field('quantity', 'Quantity', 'number', { required: true }), field('price', 'Unit price', 'money', { required: true })] },
  { key: 'transactions', label: 'Transactions', singular: 'Transaction', endpoint: 'transactions', description: 'Payment and settlement records.', group: 'Commerce', filters: ['user_id', 'type', 'status'], sortableFields: ['id', 'user_id', 'amount', 'type', 'status', 'created_at'], fields: [foreign('user_id', 'Customer', 'users', false), field('amount', 'Amount', 'money', { required: true }), field('type', 'Type', 'suggestion', { required: true, values: ['payment', 'refund', 'payout', 'adjustment'] }), field('status', 'Status', 'suggestion', { required: true, values: ['pending', 'completed', 'failed', 'refunded'] })] },
  { key: 'products', label: 'Products', singular: 'Product', endpoint: 'products', description: 'Manage your catalog, pricing, and product details.', group: 'Catalog', searchable: true, filters: ['tenant_id'], sortableFields: ['id', 'tenant_id', 'name', 'price', 'created_at'], fields: [foreign('tenant_id', 'Organization', 'tenants'), field('name', 'Name', 'text', { required: true }), field('description', 'Description', 'textarea'), field('price', 'Price', 'money', { required: true })] },
  { key: 'categories', label: 'Categories', singular: 'Category', endpoint: 'categories', description: 'Organize products into browseable groups.', group: 'Catalog', searchable: true, filters: ['tenant_id'], sortableFields: ['id', 'tenant_id', 'name', 'created_at'], fields: [foreign('tenant_id', 'Organization', 'tenants'), field('name', 'Name', 'text', { required: true })] },
  { key: 'stock-items', label: 'Inventory', singular: 'Stock item', endpoint: 'stock-items', description: 'Current stock levels by store and product.', group: 'Catalog', filters: ['store_id', 'product_id'], sortableFields: ['id', 'store_id', 'product_id', 'quantity', 'created_at'], fields: [foreign('store_id', 'Store', 'stores'), foreign('product_id', 'Product', 'products'), field('quantity', 'Quantity on hand', 'number', { required: true })] },
  { key: 'tenants', label: 'Organizations', singular: 'Organization', endpoint: 'tenants', description: 'Top-level organizations and their commercial data.', group: 'Workspace', searchable: true, sortableFields: ['id', 'name', 'created_at'], fields: [field('name', 'Name', 'text', { required: true })] },
  { key: 'markets', label: 'Markets', singular: 'Market', endpoint: 'markets', description: 'Regional groups within an organization.', group: 'Workspace', searchable: true, filters: ['tenant_id'], sortableFields: ['id', 'tenant_id', 'name', 'created_at'], fields: [foreign('tenant_id', 'Organization', 'tenants'), field('name', 'Name', 'text', { required: true })] },
  { key: 'stores', label: 'Stores', singular: 'Store', endpoint: 'stores', description: 'Store locations and their market assignment.', group: 'Workspace', searchable: true, filters: ['market_id'], sortableFields: ['id', 'market_id', 'name', 'created_at'], fields: [foreign('market_id', 'Market', 'markets'), field('name', 'Name', 'text', { required: true }), field('location', 'Address / location'), field('longitude', 'Longitude', 'number', { step: 'any' }), field('latitude', 'Latitude', 'number', { step: 'any' })] },
  { key: 'roles', label: 'Roles', singular: 'Role', endpoint: 'roles', description: 'Reusable roles for access administration.', group: 'Access', searchable: true, sortableFields: ['id', 'name'], fields: [field('name', 'Name', 'text', { required: true })] },
  { key: 'permissions', label: 'Permissions', singular: 'Permission', endpoint: 'permissions', description: 'Permission definitions for role and user access.', group: 'Access', searchable: true, sortableFields: ['id', 'name'], fields: [field('name', 'Name', 'text', { required: true })] },
  { key: 'admins', label: 'Administrators', singular: 'Administrator', endpoint: 'admins', description: 'Organization administrator assignments.', group: 'Access', filters: ['user_id', 'tenant_id'], sortableFields: ['id', 'user_id', 'tenant_id', 'created_at'], fields: [foreign('user_id', 'User', 'users'), foreign('tenant_id', 'Organization', 'tenants')] },
  { key: 'audits', label: 'Audit log', singular: 'Audit event', endpoint: 'audits', description: 'Immutable record of operational events.', group: 'Access', searchable: true, readOnly: true, filters: ['user_id'], sortableFields: ['id', 'title', 'user_id', 'created_at'], fields: [field('title', 'Event', 'text', { required: true }), field('body', 'Event details', 'json', { required: true })] },
]

export interface AssociationSpec {
  key: string
  label: string
  leftKey: string
  rightKey: string
  leftLabel: string
  rightLabel: string
  leftEndpoint: string
  rightEndpoint: string
}

export const associations: AssociationSpec[] = [
  { key: 'user-roles', label: 'User roles', leftKey: 'user_id', rightKey: 'role_id', leftLabel: 'User', rightLabel: 'Role', leftEndpoint: 'users', rightEndpoint: 'roles' },
  { key: 'user-tenants', label: 'User organizations', leftKey: 'user_id', rightKey: 'tenant_id', leftLabel: 'User', rightLabel: 'Organization', leftEndpoint: 'users', rightEndpoint: 'tenants' },
  { key: 'user-permissions', label: 'User permissions', leftKey: 'user_id', rightKey: 'permission_id', leftLabel: 'User', rightLabel: 'Permission', leftEndpoint: 'users', rightEndpoint: 'permissions' },
  { key: 'user-markets', label: 'User markets', leftKey: 'user_id', rightKey: 'market_id', leftLabel: 'User', rightLabel: 'Market', leftEndpoint: 'users', rightEndpoint: 'markets' },
  { key: 'product-categories', label: 'Product categories', leftKey: 'product_id', rightKey: 'category_id', leftLabel: 'Product', rightLabel: 'Category', leftEndpoint: 'products', rightEndpoint: 'categories' },
]

export const resourceByEndpoint = (endpoint: string) => resources.find((item) => item.endpoint === endpoint)
export const endpointLabel = (endpoint: string) => endpoint === 'users' ? 'User' : resourceByEndpoint(endpoint)?.singular ?? endpoint

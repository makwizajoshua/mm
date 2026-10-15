export type FieldKind = 'text' | 'number' | 'money' | 'textarea' | 'json' | 'select' | 'suggestion' | 'date' | 'datetime'

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
  deletionDisabled?: boolean
}

const field = (name: string, label: string, kind: FieldKind = 'text', extra: Partial<FieldSpec> = {}): FieldSpec =>
  ({ name, label, kind, ...extra })
const foreign = (name: string, label: string, endpoint: string, required = true): FieldSpec =>
  field(name, label, 'select', { optionsFrom: endpoint, required })
const status = (values: string[]) => field('status', 'Status', 'suggestion', { values })

export const resources: ResourceSpec[] = [
  { key: 'orders', label: 'Sales', singular: 'Sale', endpoint: 'orders', description: 'Completed sales and receipts across your stores.', group: 'Sales', searchable: true, readOnly: true, filters: ['store_id', 'status'], sortableFields: ['id', 'store_id', 'receipt_number', 'total', 'status', 'sold_at'], fields: [foreign('store_id', 'Store', 'stores'), field('receipt_number', 'Receipt'), field('total', 'Total', 'money'), status(['draft', 'completed', 'voided', 'refunded']), field('sold_at', 'Sold at', 'date')] },
  { key: 'order-items', label: 'Sale items', singular: 'Sale item', endpoint: 'order-items', description: 'Product lines recorded on each sale.', group: 'Sales', readOnly: true, filters: ['order_id', 'product_id'], sortableFields: ['id', 'order_id', 'product_id', 'quantity', 'price', 'created_at'], fields: [foreign('order_id', 'Sale', 'orders'), foreign('product_id', 'Product', 'products'), field('product_name', 'Product name'), field('quantity', 'Quantity', 'number'), field('price', 'Unit price', 'money')] },
  { key: 'payments', label: 'Payments', singular: 'Payment', endpoint: 'payments', description: 'Payment tenders recorded against sales.', group: 'Finance', readOnly: true, filters: ['order_id', 'method', 'status'], sortableFields: ['id', 'order_id', 'amount', 'method', 'status', 'paid_at'], fields: [foreign('order_id', 'Sale', 'orders'), field('amount', 'Amount', 'money'), field('method', 'Method'), status(['pending', 'completed', 'failed', 'refunded']), field('reference', 'Reference'), field('paid_at', 'Paid at', 'date')] },
  { key: 'transactions', label: 'Finance', singular: 'Transaction', endpoint: 'transactions', description: 'Track company income, expenses, and transfers.', group: 'Finance', searchable: true, deletionDisabled: true, filters: ['store_id', 'transaction_type', 'status', 'category'], sortableFields: ['id', 'store_id', 'amount', 'transaction_type', 'status', 'occurred_at'], fields: [foreign('store_id', 'Store', 'stores', false), foreign('employee_id', 'Employee', 'employees', false), foreign('order_id', 'Sale', 'orders', false), field('amount', 'Amount', 'money', { required: true }), field('transaction_type', 'Type', 'suggestion', { required: true, values: ['income', 'expense', 'transfer'] }), field('category', 'Category', 'text', { required: true }), status(['pending', 'posted', 'voided']), field('description', 'Description', 'textarea'), field('occurred_at', 'Date and time', 'datetime', { required: true })] },
  { key: 'products', label: 'Products', singular: 'Product', endpoint: 'products', description: 'Manage your company catalog and prices.', group: 'Inventory', searchable: true, sortableFields: ['id', 'name', 'price', 'created_at'], fields: [field('name', 'Name', 'text', { required: true }), field('description', 'Description', 'textarea'), field('price', 'Price', 'money', { required: true })] },
  { key: 'categories', label: 'Categories', singular: 'Category', endpoint: 'categories', description: 'Organize products into business categories.', group: 'Inventory', searchable: true, sortableFields: ['id', 'name', 'created_at'], fields: [field('name', 'Name', 'text', { required: true })] },
  { key: 'stock-items', label: 'Stock levels', singular: 'Stock level', endpoint: 'stock-items', description: 'Current stock by store and product.', group: 'Inventory', filters: ['store_id', 'product_id'], readOnly: true, sortableFields: ['id', 'store_id', 'product_id', 'quantity', 'updated_at'], fields: [foreign('store_id', 'Store', 'stores'), foreign('product_id', 'Product', 'products'), field('quantity', 'Quantity on hand', 'number')] },
  { key: 'inventory-movements', label: 'Stock movements', singular: 'Stock movement', endpoint: 'inventory-movements', description: 'Immutable history of stock receipts, sales, transfers, and adjustments.', group: 'Inventory', filters: ['store_id', 'product_id', 'movement_type'], readOnly: true, sortableFields: ['id', 'store_id', 'product_id', 'movement_type', 'quantity_delta', 'occurred_at'], fields: [foreign('store_id', 'Store', 'stores'), foreign('product_id', 'Product', 'products'), field('movement_type', 'Movement'), field('quantity_delta', 'Quantity change', 'number'), field('note', 'Note', 'textarea'), field('occurred_at', 'Date', 'date')] },
  { key: 'employees', label: 'Employees', singular: 'Employee', endpoint: 'employees', description: 'Manage staff, employment status, and store assignments.', group: 'People', searchable: true, filters: ['employment_status'], sortableFields: ['id', 'employee_number', 'first_name', 'last_name', 'employment_status', 'hired_at'], fields: [field('employee_number', 'Employee number', 'text', { required: true }), field('first_name', 'First name', 'text', { required: true }), field('last_name', 'Last name', 'text', { required: true }), field('email', 'Email'), field('phone', 'Phone'), field('job_title', 'Job title'), field('employment_status', 'Employment status', 'suggestion', { values: ['active', 'inactive', 'on_leave', 'terminated'] }), field('hired_at', 'Hire date', 'date')] },
  { key: 'markets', label: 'Markets', singular: 'Market', endpoint: 'markets', description: 'Organize your company’s locations into operating regions.', group: 'Locations', searchable: true, sortableFields: ['id', 'name', 'created_at'], fields: [field('name', 'Name', 'text', { required: true })] },
  { key: 'locations', label: 'Locations', singular: 'Location', endpoint: 'locations', description: 'Maintain addresses for your company’s operating sites.', group: 'Locations', searchable: true, sortableFields: ['id', 'name', 'city', 'region', 'created_at'], fields: [field('name', 'Location name', 'text', { required: true }), field('address_line1', 'Address', 'text', { required: true }), field('address_line2', 'Address line 2'), field('city', 'City', 'text', { required: true }), field('region', 'Region'), field('postal_code', 'Postal code'), field('country_code', 'Country code', 'text', { required: true }), field('latitude', 'Latitude', 'number', { step: 'any' }), field('longitude', 'Longitude', 'number', { step: 'any' })] },
  { key: 'stores', label: 'Stores', singular: 'Store', endpoint: 'stores', description: 'Manage store operations at your company locations.', group: 'Locations', searchable: true, filters: ['market_id', 'location_id', 'status'], sortableFields: ['id', 'name', 'store_code', 'status', 'created_at'], fields: [foreign('market_id', 'Market', 'markets', false), foreign('location_id', 'Location', 'locations'), field('name', 'Store name', 'text', { required: true }), field('store_code', 'Store code', 'text', { required: true }), field('status', 'Status', 'suggestion', { values: ['active', 'inactive', 'closed'] })] },
  { key: 'audits', label: 'Audit trail', singular: 'Audit event', endpoint: 'audits', description: 'Immutable record of actions across this company’s operations.', group: 'Governance', searchable: true, readOnly: true, filters: ['entity_type', 'action'], sortableFields: ['id', 'title', 'entity_type', 'action', 'created_at'], fields: [field('title', 'Event'), field('entity_type', 'Record type'), field('entity_id', 'Record ID'), field('action', 'Action'), field('body', 'Details', 'json')] },
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

export const associations: AssociationSpec[] = []
export const resourceByEndpoint = (endpoint: string) => resources.find((item) => item.endpoint === endpoint)
export const endpointLabel = (endpoint: string) => endpoint === 'users' ? 'User' : resourceByEndpoint(endpoint)?.singular ?? endpoint

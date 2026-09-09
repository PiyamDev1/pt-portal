'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Loader2, Plus, Save, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiResponse } from '@/lib/api/http'

type CategoryRow = {
  id: string
  category_key: string
  label: string
  description: string | null
  icon_key: string
  display_order: number
  supplier_payments_enabled: boolean
  is_active: boolean
  is_system: boolean
}
type ServiceRow = {
  id: string
  item_key: string
  category_id: string
  label: string
  classification: 'SERVICE' | 'EXPENSE'
  default_direction: 'IN' | 'OUT'
  allowed_payment_methods: string[]
  source_required: boolean
  customer_required: boolean
  note_required: boolean
  price_required: boolean
  loyalty_eligible: boolean
  points_per_gbp: number
  logo_key: string | null
  display_order: number
  is_active: boolean
}
type SupplierRow = {
  name: string
  supplier_vendor_id: string
  alternate_names: string[]
  source_area: string | null
  source_reference: string | null
  is_active: boolean
  supplier_vendors: { name: string } | Array<{ name: string }>
}
type AssignmentRow = {
  category_id: string
  supplier_vendor_id: string
  is_default: boolean
  is_active: boolean
}
type Configuration = {
  categories: CategoryRow[]
  services: ServiceRow[]
  suppliers: SupplierRow[]
  assignments: AssignmentRow[]
}

function supplierName(row: SupplierRow) {
  return row.name
}

export default function PosConfigurationClient() {
  const [data, setData] = useState<Configuration | null>(null)
  const [busy, setBusy] = useState('')
  const [newSupplier, setNewSupplier] = useState({ name: '', aliases: '', sourceArea: '' })
  const [newCategory, setNewCategory] = useState({ key: '', label: '' })
  const [newService, setNewService] = useState({
    key: '',
    label: '',
    categoryKey: '',
    direction: 'IN' as 'IN' | 'OUT',
  })
  const [assignment, setAssignment] = useState({
    categoryKey: '',
    supplierId: '',
    isDefault: false,
  })

  const load = useCallback(async () => {
    const response = await fetch('/api/accounting/pos-configuration', {
      cache: 'no-store',
      credentials: 'include',
    })
    const result = (await response.json()) as ApiResponse<Configuration>
    if (!response.ok || 'error' in result)
      throw new Error('error' in result ? result.error : 'Unable to load configuration.')
    setData(result)
    setAssignment((current) => ({
      ...current,
      categoryKey:
        current.categoryKey ||
        result.categories.find((category) => category.supplier_payments_enabled)?.category_key ||
        '',
      supplierId: current.supplierId || result.suppliers[0]?.supplier_vendor_id || '',
    }))
    setNewService((current) => ({
      ...current,
      categoryKey: current.categoryKey || result.categories[0]?.category_key || '',
    }))
  }, [])

  useEffect(() => {
    void load().catch((error) => toast.error(error.message))
  }, [load])

  async function mutate(key: string, payload: Record<string, unknown>) {
    setBusy(key)
    try {
      const response = await fetch('/api/accounting/pos-configuration', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok || result.error)
        throw new Error(result.error || 'Unable to save configuration.')
      toast.success('POS configuration saved')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save configuration.')
    } finally {
      setBusy('')
    }
  }

  function updateCategory(id: string, patch: Partial<CategoryRow>) {
    setData((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((row) =>
              row.id === id ? { ...row, ...patch } : row,
            ),
          }
        : current,
    )
  }
  function updateService(id: string, patch: Partial<ServiceRow>) {
    setData((current) =>
      current
        ? {
            ...current,
            services: current.services.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          }
        : current,
    )
  }
  function updateSupplier(id: string, patch: Partial<SupplierRow>) {
    setData((current) =>
      current
        ? {
            ...current,
            suppliers: current.suppliers.map((row) =>
              row.supplier_vendor_id === id ? { ...row, ...patch } : row,
            ),
          }
        : current,
    )
  }

  if (!data)
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
      </div>
    )

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white">
          <Settings2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-black text-slate-950">POS configuration</h1>
          <p className="mt-1 text-sm text-slate-500">
            Changes apply to future transactions. Stable keys and historical labels remain
            protected.
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-4 py-3">
          <h2 className="font-black">Categories</h2>
          <p className="text-xs text-slate-500">
            Labels, order, availability and supplier-payment eligibility.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void mutate('new-category', {
              action: 'UPSERT_CATEGORY',
              key: newCategory.key,
              label: newCategory.label,
              iconKey: 'sparkles',
              displayOrder: data.categories.length * 10 + 10,
              supplierPaymentsEnabled: false,
              isActive: true,
            }).then(() => setNewCategory({ key: '', label: '' }))
          }}
          className="grid gap-2 border-b bg-emerald-50/40 p-4 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input
            required
            value={newCategory.key}
            onChange={(event) =>
              setNewCategory({
                ...newCategory,
                key: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
              })
            }
            placeholder="Stable key"
            className="h-9 rounded-lg border px-3 text-sm"
          />
          <input
            required
            value={newCategory.label}
            onChange={(event) => setNewCategory({ ...newCategory, label: event.target.value })}
            placeholder="New category label"
            className="h-9 rounded-lg border px-3 text-sm"
          />
          <button
            disabled={busy !== ''}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white"
          >
            <Plus className="h-4 w-4" /> Add category
          </button>
        </form>
        <div className="divide-y">
          {data.categories.map((category) => (
            <div
              key={category.id}
              className="grid gap-2 p-4 md:grid-cols-[1fr_2fr_6rem_auto_auto_auto] md:items-end"
            >
              <label className="text-xs font-bold text-slate-600">
                Label
                <input
                  value={category.label}
                  onChange={(event) => updateCategory(category.id, { label: event.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border px-3 font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Description
                <input
                  value={category.description || ''}
                  onChange={(event) =>
                    updateCategory(category.id, { description: event.target.value })
                  }
                  className="mt-1 h-9 w-full rounded-lg border px-3 font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Order
                <input
                  type="number"
                  value={category.display_order}
                  onChange={(event) =>
                    updateCategory(category.id, { display_order: Number(event.target.value) })
                  }
                  className="mt-1 h-9 w-full rounded-lg border px-2 font-normal"
                />
              </label>
              <label className="flex h-9 items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={category.supplier_payments_enabled}
                  onChange={(event) =>
                    updateCategory(category.id, { supplier_payments_enabled: event.target.checked })
                  }
                />{' '}
                Pay suppliers
              </label>
              <label className="flex h-9 items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={category.is_active}
                  onChange={(event) =>
                    updateCategory(category.id, { is_active: event.target.checked })
                  }
                />{' '}
                Active
              </label>
              <button
                onClick={() =>
                  void mutate(`category-${category.id}`, {
                    action: 'UPSERT_CATEGORY',
                    key: category.category_key,
                    label: category.label,
                    description: category.description || undefined,
                    iconKey: category.icon_key,
                    displayOrder: category.display_order,
                    supplierPaymentsEnabled: category.supplier_payments_enabled,
                    isActive: category.is_active,
                  })
                }
                disabled={busy !== ''}
                className="flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white"
              >
                <Save className="h-4 w-4" /> Save
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-4 py-3">
          <h2 className="font-black">Services and subservices</h2>
          <p className="text-xs text-slate-500">
            Direction is explicit: Donation and expenses are money out; Other income is money in.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void mutate('new-service', {
              action: 'UPSERT_SERVICE',
              key: newService.key,
              categoryKey: newService.categoryKey,
              label: newService.label,
              classification: newService.direction === 'OUT' ? 'EXPENSE' : 'SERVICE',
              direction: newService.direction,
              displayOrder: 100,
              loyaltyEligible: false,
              pointsPerGbp: 0,
              allowedPaymentMethods: ['CASH', 'CARD', 'BANK'],
              customerRequired: false,
              noteRequired: newService.direction === 'OUT',
              priceRequired: false,
              sourceRequired: false,
              isActive: true,
            }).then(() => setNewService({ ...newService, key: '', label: '' }))
          }}
          className="grid gap-2 border-b bg-emerald-50/40 p-4 sm:grid-cols-[1fr_1fr_1fr_7rem_auto]"
        >
          <select
            value={newService.categoryKey}
            onChange={(event) => setNewService({ ...newService, categoryKey: event.target.value })}
            className="h-9 rounded-lg border px-3 text-sm"
          >
            {data.categories.map((row) => (
              <option key={row.id} value={row.category_key}>
                {row.label}
              </option>
            ))}
          </select>
          <input
            required
            value={newService.key}
            onChange={(event) =>
              setNewService({
                ...newService,
                key: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
              })
            }
            placeholder="Stable service key"
            className="h-9 rounded-lg border px-3 text-sm"
          />
          <input
            required
            value={newService.label}
            onChange={(event) => setNewService({ ...newService, label: event.target.value })}
            placeholder="Service label"
            className="h-9 rounded-lg border px-3 text-sm"
          />
          <select
            value={newService.direction}
            onChange={(event) =>
              setNewService({ ...newService, direction: event.target.value as 'IN' | 'OUT' })
            }
            className="h-9 rounded-lg border px-2 text-sm"
          >
            <option value="IN">Money in</option>
            <option value="OUT">Money out</option>
          </select>
          <button
            disabled={busy !== ''}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white"
          >
            <Plus className="h-4 w-4" /> Add service
          </button>
        </form>
        <div className="divide-y">
          {data.services.map((service) => {
            const category = data.categories.find((row) => row.id === service.category_id)
            return (
              <div
                key={service.id}
                className="grid gap-2 p-4 lg:grid-cols-[1.4fr_1fr_5rem_5rem_auto] lg:items-end"
              >
                <label className="text-xs font-bold text-slate-600">
                  {category?.label || 'Category'}
                  <input
                    value={service.label}
                    onChange={(event) => updateService(service.id, { label: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Payment methods
                  <input
                    value={service.allowed_payment_methods.join(', ')}
                    onChange={(event) =>
                      updateService(service.id, {
                        allowed_payment_methods: event.target.value
                          .split(',')
                          .map((value) => value.trim().toUpperCase())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Order
                  <input
                    type="number"
                    value={service.display_order}
                    onChange={(event) =>
                      updateService(service.id, { display_order: Number(event.target.value) })
                    }
                    className="mt-1 h-9 w-full rounded-lg border px-2 font-normal"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Pts/GBP
                  <input
                    type="number"
                    step="0.1"
                    value={service.points_per_gbp}
                    onChange={(event) =>
                      updateService(service.id, { points_per_gbp: Number(event.target.value) })
                    }
                    className="mt-1 h-9 w-full rounded-lg border px-2 font-normal"
                  />
                </label>
                <div className="flex flex-wrap gap-x-3 gap-y-1 lg:col-span-4">
                  {[
                    ['Loyalty', 'loyalty_eligible'],
                    ['Customer required', 'customer_required'],
                    ['Note required', 'note_required'],
                    ['Price required', 'price_required'],
                    ['Source required', 'source_required'],
                    ['Active', 'is_active'],
                  ].map(([label, field]) => (
                    <label key={field} className="flex items-center gap-1 text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(service[field as keyof ServiceRow])}
                        onChange={(event) =>
                          updateService(service.id, { [field]: event.target.checked })
                        }
                      />{' '}
                      {label}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() =>
                    void mutate(`service-${service.id}`, {
                      action: 'UPSERT_SERVICE',
                      key: service.item_key,
                      categoryKey: category?.category_key,
                      label: service.label,
                      classification: service.classification,
                      direction: service.default_direction,
                      displayOrder: service.display_order,
                      logoKey: service.logo_key || undefined,
                      loyaltyEligible: service.loyalty_eligible,
                      pointsPerGbp: service.points_per_gbp,
                      allowedPaymentMethods: service.allowed_payment_methods,
                      customerRequired: service.customer_required,
                      noteRequired: service.note_required,
                      priceRequired: service.price_required,
                      sourceRequired: service.source_required,
                      isActive: service.is_active,
                    })
                  }
                  disabled={busy !== ''}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white"
                >
                  <Save className="h-4 w-4" /> Save
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-emerald-700" />
          <h2 className="font-black">Suppliers and category assignments</h2>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void mutate('new-supplier', {
                action: 'UPSERT_SUPPLIER',
                name: newSupplier.name,
                aliases: newSupplier.aliases
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
                sourceArea: newSupplier.sourceArea || undefined,
                isActive: true,
              }).then(() => setNewSupplier({ name: '', aliases: '', sourceArea: '' }))
            }}
            className="space-y-2 rounded-xl bg-slate-50 p-4"
          >
            <h3 className="text-sm font-black">Add or update supplier</h3>
            <input
              required
              value={newSupplier.name}
              onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })}
              placeholder="Supplier name"
              className="h-9 w-full rounded-lg border px-3 text-sm"
            />
            <input
              value={newSupplier.aliases}
              onChange={(event) => setNewSupplier({ ...newSupplier, aliases: event.target.value })}
              placeholder="Aliases, comma separated"
              className="h-9 w-full rounded-lg border px-3 text-sm"
            />
            <input
              value={newSupplier.sourceArea}
              onChange={(event) =>
                setNewSupplier({ ...newSupplier, sourceArea: event.target.value })
              }
              placeholder="Source area"
              className="h-9 w-full rounded-lg border px-3 text-sm"
            />
            <button
              disabled={busy !== ''}
              className="flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white"
            >
              <Plus className="h-4 w-4" /> Save supplier
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void mutate('assignment', { action: 'SET_ASSIGNMENT', ...assignment, isActive: true })
            }}
            className="space-y-2 rounded-xl bg-slate-50 p-4"
          >
            <h3 className="text-sm font-black">Assign supplier to category</h3>
            <select
              value={assignment.categoryKey}
              onChange={(event) =>
                setAssignment({ ...assignment, categoryKey: event.target.value })
              }
              className="h-9 w-full rounded-lg border px-3 text-sm"
            >
              {data.categories
                .filter((row) => row.supplier_payments_enabled)
                .map((row) => (
                  <option key={row.id} value={row.category_key}>
                    {row.label}
                  </option>
                ))}
            </select>
            <select
              value={assignment.supplierId}
              onChange={(event) => setAssignment({ ...assignment, supplierId: event.target.value })}
              className="h-9 w-full rounded-lg border px-3 text-sm"
            >
              {data.suppliers
                .filter((row) => row.is_active)
                .map((row) => (
                  <option key={row.supplier_vendor_id} value={row.supplier_vendor_id}>
                    {supplierName(row)}
                  </option>
                ))}
            </select>
            <label className="flex h-9 items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={assignment.isDefault}
                onChange={(event) =>
                  setAssignment({ ...assignment, isDefault: event.target.checked })
                }
              />{' '}
              Default supplier for category
            </label>
            <button
              disabled={busy !== ''}
              className="flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white"
            >
              <Plus className="h-4 w-4" /> Save assignment
            </button>
          </form>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.suppliers.map((supplier) => (
            <div
              key={supplier.supplier_vendor_id}
              className="space-y-2 rounded-xl border border-slate-200 p-3"
            >
              <input
                value={supplier.name}
                onChange={(event) =>
                  updateSupplier(supplier.supplier_vendor_id, { name: event.target.value })
                }
                aria-label="Supplier name"
                className="h-8 w-full rounded-lg border px-2 text-xs font-black"
              />
              <input
                value={supplier.alternate_names.join(', ')}
                onChange={(event) =>
                  updateSupplier(supplier.supplier_vendor_id, {
                    alternate_names: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
                aria-label="Supplier aliases"
                placeholder="Aliases, comma separated"
                className="h-8 w-full rounded-lg border px-2 text-xs"
              />
              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateSupplier(supplier.supplier_vendor_id, { is_active: !supplier.is_active })
                  }
                  className={`rounded-lg px-2 py-1 text-[10px] font-black ${supplier.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}
                >
                  {supplier.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void mutate(`supplier-${supplier.supplier_vendor_id}`, {
                      action: 'UPSERT_SUPPLIER',
                      supplierId: supplier.supplier_vendor_id,
                      name: supplier.name,
                      aliases: supplier.alternate_names,
                      sourceArea: supplier.source_area || undefined,
                      sourceReference: supplier.source_reference || undefined,
                      isActive: supplier.is_active,
                    })
                  }
                  className="rounded-lg bg-slate-950 px-2 py-1 text-[10px] font-black text-white"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.assignments
            .filter((row) => row.is_active)
            .map((row) => (
              <span
                key={`${row.category_id}-${row.supplier_vendor_id}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"
              >
                {data.categories.find((category) => category.id === row.category_id)?.label} ·{' '}
                {supplierName(
                  data.suppliers.find(
                    (supplier) => supplier.supplier_vendor_id === row.supplier_vendor_id,
                  )!,
                )}
                {row.is_default ? ' · default' : ''}
                <button
                  type="button"
                  onClick={() =>
                    void mutate(`unassign-${row.category_id}-${row.supplier_vendor_id}`, {
                      action: 'SET_ASSIGNMENT',
                      categoryKey: data.categories.find(
                        (category) => category.id === row.category_id,
                      )?.category_key,
                      supplierId: row.supplier_vendor_id,
                      isDefault: false,
                      isActive: false,
                    })
                  }
                  className="ml-2 text-rose-700"
                  aria-label="Remove supplier assignment"
                >
                  ×
                </button>
              </span>
            ))}
        </div>
      </section>
    </div>
  )
}

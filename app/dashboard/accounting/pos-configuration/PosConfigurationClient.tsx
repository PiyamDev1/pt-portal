'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  FolderTree,
  ImageIcon,
  Layers3,
  Link2,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  Store,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ApiResponse } from '@/lib/api/http'
import { POS_PROVIDER_LOGO_KEYS, POS_SUPPLIER_LOGO_KEYS, posLogoUrl } from '@/lib/pos/logos'

type PaymentMethod = 'CASH' | 'CARD' | 'BANK'
type ConfigurationTab = 'overview' | 'categories' | 'services' | 'suppliers' | 'assignments'

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
  allowed_payment_methods: PaymentMethod[]
  tracked_source_type: string | null
  source_required: boolean
  customer_required: boolean
  note_required: boolean
  price_required: boolean
  logo_key: string | null
  logo_url: string | null
  display_order: number
  is_active: boolean
}

type SupplierRow = {
  name: string
  supplier_vendor_id: string
  alternate_names: string[]
  source_area: string | null
  source_reference: string | null
  settlement_mode: 'DEPOSIT_ACCOUNT' | 'PAY_ON_DEMAND'
  logo_key: string | null
  logo_url: string | null
  is_system: boolean
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
  capabilityVersion: number
  configurationReady: boolean
}

type LogoUpload = {
  logoKey: string
  logoUrl: string
  originalBytes: number
  storedBytes: number
  width: number
  height: number
}

const FIELD_CLASS =
  'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'
const SMALL_FIELD_CLASS =
  'h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100'
const ICON_OPTIONS = [
  ['file-text', 'Document'],
  ['plane', 'Travel'],
  ['landmark', 'Finance'],
  ['package', 'Cargo'],
  ['files', 'Assistance'],
  ['shapes', 'Other'],
  ['sparkles', 'General'],
] as const

const TABS: Array<{
  id: ConfigurationTab
  label: string
  description: string
  icon: typeof Settings2
}> = [
  { id: 'overview', label: 'Overview', description: 'Health and guidance', icon: ShieldCheck },
  { id: 'categories', label: 'Categories', description: 'Top-level POS choices', icon: FolderTree },
  { id: 'services', label: 'Services', description: 'Subservices and rules', icon: Layers3 },
  { id: 'suppliers', label: 'Suppliers', description: 'Names, aliases and logos', icon: Building2 },
  { id: 'assignments', label: 'Assignments', description: 'Allowed supplier links', icon: Link2 },
]

function normalized(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
}

function LogoEditor({
  kind,
  label,
  logoKey,
  logoUrl,
  disabled,
  onChange,
}: {
  kind: 'service' | 'supplier'
  label: string
  logoKey: string | null
  logoUrl: string | null
  disabled: boolean
  onChange: (logoKey: string | null, logoUrl: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const builtIns = kind === 'service' ? POS_PROVIDER_LOGO_KEYS : POS_SUPPLIER_LOGO_KEYS
  const builtInValue =
    logoKey && builtIns.includes(logoKey as never)
      ? logoKey
      : logoKey?.startsWith('custom-')
        ? '__custom__'
        : ''

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/accounting/pos-configuration/logo', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        body: form,
      })
      const result = (await response.json()) as ApiResponse<LogoUpload>
      if (!response.ok || 'error' in result) {
        throw new Error('error' in result ? result.error : 'Unable to upload logo.')
      }
      onChange(result.logoKey, result.logoUrl)
      toast.success('Logo optimized', {
        description: `${result.width}×${result.height} WebP · ${formatBytes(result.originalBytes)} → ${formatBytes(result.storedBytes)}. Save this record to apply it.`,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to upload logo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={`${label} logo`}
              width={80}
              height={48}
              unoptimized
              className="max-h-10 w-auto max-w-full object-contain"
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-slate-300" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black text-slate-800">Logo</p>
          <p className="text-[10px] leading-4 text-slate-500">
            PNG, JPEG or WebP · resized to fit 512×256 · maximum output 256 KB
          </p>
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select
          aria-label={`${label} built-in logo`}
          value={builtInValue}
          disabled={disabled || uploading}
          onChange={(event) => {
            const key = event.target.value === '__custom__' ? logoKey : event.target.value || null
            onChange(key, posLogoUrl(key, kind))
          }}
          className={SMALL_FIELD_CLASS}
        >
          <option value="">No built-in logo</option>
          {builtIns.map((key) => (
            <option key={key} value={key}>
              {key.replace(/-/g, ' ')}
            </option>
          ))}
          {logoKey?.startsWith('custom-') && (
            <option value="__custom__" disabled>
              Custom optimized logo
            </option>
          )}
        </select>
        <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-black text-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? 'Optimizing…' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || uploading}
            onChange={(event) => {
              void upload(event.target.files?.[0])
              event.target.value = ''
            }}
            className="sr-only"
          />
        </label>
        <button
          type="button"
          disabled={disabled || uploading || !logoKey}
          onClick={() => onChange(null, null)}
          className="flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black text-rose-700 disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h2 className="font-black text-slate-950">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
    </div>
  )
}

export default function PosConfigurationClient() {
  const [data, setData] = useState<Configuration | null>(null)
  const [busy, setBusy] = useState('')
  const [activeTab, setActiveTab] = useState<ConfigurationTab>('overview')
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('')
  const [newCategory, setNewCategory] = useState({ key: '', label: '', description: '' })
  const [newService, setNewService] = useState({
    key: '',
    label: '',
    categoryKey: '',
    direction: 'IN' as 'IN' | 'OUT',
  })
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    aliases: '',
    sourceArea: '',
    sourceReference: '',
    settlementMode: 'DEPOSIT_ACCOUNT' as 'DEPOSIT_ACCOUNT' | 'PAY_ON_DEMAND',
    logoKey: null as string | null,
    logoUrl: null as string | null,
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
    if (!response.ok || 'error' in result) {
      throw new Error('error' in result ? result.error : 'Unable to load configuration.')
    }
    setData(result)
    const firstSupplierCategory = result.categories.find(
      (category) => category.supplier_payments_enabled,
    )
    setServiceCategoryFilter((current) => current || result.categories[0]?.category_key || '')
    setNewService((current) => ({
      ...current,
      categoryKey: current.categoryKey || result.categories[0]?.category_key || '',
    }))
    setAssignment((current) => ({
      ...current,
      categoryKey: current.categoryKey || firstSupplierCategory?.category_key || '',
      supplierId:
        current.supplierId ||
        result.suppliers.find((row) => row.is_active)?.supplier_vendor_id ||
        '',
    }))
  }, [])

  useEffect(() => {
    void load().catch((error) => toast.error(error.message))
  }, [load])

  async function mutate(key: string, payload: Record<string, unknown>) {
    if (!data?.configurationReady) {
      toast.error('Install POS configuration capability 2026090903 before saving changes.')
      return false
    }
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
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Unable to save configuration.')
      }
      toast.success('POS configuration saved')
      await load()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save configuration.')
      return false
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

  const integrityIssues = useMemo(() => {
    if (!data) return []
    const issues: string[] = []
    const categoryLabels = new Set<string>()
    for (const category of data.categories.filter((row) => row.is_active)) {
      const key = normalized(category.label)
      if (categoryLabels.has(key)) issues.push(`Duplicate active category: ${category.label}`)
      categoryLabels.add(key)
    }
    const serviceLabels = new Set<string>()
    for (const service of data.services.filter((row) => row.is_active)) {
      const key = `${service.category_id}:${normalized(service.label)}`
      if (serviceLabels.has(key)) issues.push(`Duplicate active service: ${service.label}`)
      serviceLabels.add(key)
    }
    const supplierNames = new Set<string>()
    for (const supplier of data.suppliers) {
      for (const value of [supplier.name, ...supplier.alternate_names]) {
        const key = normalized(value)
        if (supplierNames.has(key)) issues.push(`Duplicate supplier name or alias: ${value}`)
        supplierNames.add(key)
      }
    }
    const assignments = new Set<string>()
    for (const row of data.assignments.filter((item) => item.is_active)) {
      const key = `${row.category_id}:${row.supplier_vendor_id}`
      if (assignments.has(key)) issues.push('Duplicate category-to-supplier assignment')
      assignments.add(key)
    }
    return [...new Set(issues)]
  }, [data])

  if (!data) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
      </div>
    )
  }

  const activeCategories = data.categories.filter((row) => row.is_active)
  const activeServices = data.services.filter((row) => row.is_active)
  const activeSuppliers = data.suppliers.filter((row) => row.is_active)
  const activeAssignments = data.assignments.filter((row) => row.is_active)
  const selectedAssignmentCategory = data.categories.find(
    (row) => row.category_key === assignment.categoryKey,
  )
  const availableAssignmentSuppliers = activeSuppliers.filter(
    (supplier) =>
      !activeAssignments.some(
        (row) =>
          row.category_id === selectedAssignmentCategory?.id &&
          row.supplier_vendor_id === supplier.supplier_vendor_id,
      ),
  )
  const visibleServices = data.services.filter((service) => {
    const category = data.categories.find((row) => row.id === service.category_id)
    return !serviceCategoryFilter || category?.category_key === serviceCategoryFilter
  })
  const overviewCards = [
    { label: 'Active categories', value: activeCategories.length, icon: FolderTree },
    { label: 'Active services', value: activeServices.length, icon: Layers3 },
    { label: 'Active suppliers', value: activeSuppliers.length, icon: Building2 },
    { label: 'Supplier links', value: activeAssignments.length, icon: Link2 },
  ]

  function hasDuplicateCategory(key: string, label: string, currentId?: string) {
    return data!.categories.some(
      (row) =>
        row.id !== currentId &&
        (normalized(row.category_key) === normalized(key) ||
          (row.is_active && normalized(row.label) === normalized(label))),
    )
  }

  function hasDuplicateService(key: string, label: string, categoryId: string, currentId?: string) {
    return data!.services.some(
      (row) =>
        row.id !== currentId &&
        (normalized(row.item_key) === normalized(key) ||
          (row.is_active &&
            row.category_id === categoryId &&
            normalized(row.label) === normalized(label))),
    )
  }

  function hasDuplicateSupplier(name: string, aliases: string[], currentId?: string) {
    const requested = [name, ...aliases].map(normalized)
    if (new Set(requested).size !== requested.length) return true
    return data!.suppliers.some(
      (row) =>
        row.supplier_vendor_id !== currentId &&
        [row.name, ...row.alternate_names]
          .map(normalized)
          .some((value) => requested.includes(value)),
    )
  }

  async function saveCategory(category: CategoryRow) {
    if (hasDuplicateCategory(category.category_key, category.label, category.id)) {
      toast.error('Category keys and active labels must be unique.')
      return
    }
    await mutate(`category-${category.id}`, {
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

  async function saveService(service: ServiceRow) {
    const category = data!.categories.find((row) => row.id === service.category_id)
    if (!category) return
    if (hasDuplicateService(service.item_key, service.label, service.category_id, service.id)) {
      toast.error('Service keys and active labels within a category must be unique.')
      return
    }
    await mutate(`service-${service.id}`, {
      action: 'UPSERT_SERVICE',
      key: service.item_key,
      categoryKey: category.category_key,
      label: service.label,
      classification: service.classification,
      direction: service.default_direction,
      displayOrder: service.display_order,
      logoKey: service.logo_key,
      allowedPaymentMethods: service.allowed_payment_methods,
      customerRequired: service.customer_required,
      noteRequired: service.note_required,
      priceRequired: service.price_required,
      sourceRequired: service.source_required,
      isActive: service.is_active,
    })
  }

  async function saveSupplier(supplier: SupplierRow) {
    if (
      hasDuplicateSupplier(supplier.name, supplier.alternate_names, supplier.supplier_vendor_id)
    ) {
      toast.error('Supplier names and aliases must be unique.')
      return
    }
    await mutate(`supplier-${supplier.supplier_vendor_id}`, {
      action: 'UPSERT_SUPPLIER',
      supplierId: supplier.supplier_vendor_id,
      name: supplier.name,
      aliases: supplier.alternate_names,
      sourceArea: supplier.source_area || undefined,
      sourceReference: supplier.source_reference || undefined,
      settlementMode: supplier.settlement_mode,
      logoKey: supplier.logo_key,
      isActive: supplier.is_active,
    })
  }

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <Settings2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-slate-950">POS configuration</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Organise what staff see in Quick Transaction. Changes affect future entries only;
              stable keys and historical ledger labels remain protected.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load().catch((error) => toast.error(error.message))}
          disabled={busy !== ''}
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm"
        >
          <RefreshCcw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {!data.configurationReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">Configuration database upgrade pending</p>
            <p className="mt-0.5 text-xs">
              Apply capability 2026090903 to save duplicate-safe changes and custom logos. The live
              POS remains available on capability {data.capabilityVersion}.
            </p>
          </div>
        </div>
      )}

      <nav
        aria-label="POS configuration sections"
        className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-5"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-14 items-center gap-2 border-b border-slate-100 px-3 text-left transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
                selected ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>
                <span className="block text-xs font-black">{tab.label}</span>
                <span
                  className={`block text-[10px] ${selected ? 'text-emerald-100' : 'text-slate-400'}`}
                >
                  {tab.description}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map(({ label, value, icon: Icon }) => (
              <article
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    {label}
                  </p>
                  <Icon className="h-4 w-4 text-emerald-700" />
                </div>
                <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <SectionHeader
                title="Configuration health"
                description="Checks active records for confusing duplicates."
              />
              <div className="p-4">
                {integrityIssues.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-black">No duplicates detected</p>
                      <p className="mt-0.5 text-xs">
                        Category labels, service labels, supplier identities and assignments are
                        distinct.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {integrityIssues.map((issue) => (
                      <p
                        key={issue}
                        className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
                      >
                        {issue}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <SectionHeader
                title="Where settings belong"
                description="Clear ownership prevents the same rule being configured twice."
              />
              <div className="space-y-3 p-4 text-xs text-slate-600">
                <p>
                  <b className="text-slate-900">POS configuration:</b> labels, order, activation,
                  transaction requirements, payment methods, suppliers and logos.
                </p>
                <p>
                  <b className="text-slate-900">Loyalty module:</b> eligibility, earning rates,
                  campaigns, balances and reversals. They are intentionally not editable here.
                </p>
                <p>
                  <b className="text-slate-900">Historical ledger:</b> never renamed by
                  configuration changes because posting stores label snapshots.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
              Recommended setup order
            </p>
            <div className="mt-3 flex flex-col gap-2 text-xs font-bold sm:flex-row sm:items-center">
              {['Categories', 'Services', 'Suppliers', 'Assignments', 'Test in POS'].map(
                (step, index) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px]">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                    {index < 4 && (
                      <ArrowRight className="hidden h-3.5 w-3.5 text-slate-500 sm:block" />
                    )}
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'categories' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Categories"
            description="Top-level choices shown in the POS category rail."
          />
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (hasDuplicateCategory(newCategory.key, newCategory.label)) {
                toast.error('A category already uses this key or active label.')
                return
              }
              void mutate('new-category', {
                action: 'UPSERT_CATEGORY',
                key: newCategory.key,
                label: newCategory.label,
                description: newCategory.description || undefined,
                iconKey: 'sparkles',
                displayOrder: data.categories.length * 10 + 10,
                supplierPaymentsEnabled: false,
                isActive: true,
              }).then((saved) => saved && setNewCategory({ key: '', label: '', description: '' }))
            }}
            className="grid gap-2 border-b border-slate-200 bg-emerald-50/40 p-4 lg:grid-cols-[1fr_1fr_1.5fr_auto]"
          >
            <input
              required
              value={newCategory.key}
              onChange={(event) =>
                setNewCategory({ ...newCategory, key: slugify(event.target.value) })
              }
              placeholder="Stable key"
              className={SMALL_FIELD_CLASS}
            />
            <input
              required
              value={newCategory.label}
              onChange={(event) => setNewCategory({ ...newCategory, label: event.target.value })}
              placeholder="Category label"
              className={SMALL_FIELD_CLASS}
            />
            <input
              value={newCategory.description}
              onChange={(event) =>
                setNewCategory({ ...newCategory, description: event.target.value })
              }
              placeholder="Plain-language description"
              className={SMALL_FIELD_CLASS}
            />
            <button
              disabled={busy !== '' || !data.configurationReady}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-black text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add category
            </button>
          </form>
          <div className="divide-y divide-slate-100">
            {data.categories.map((category) => (
              <article
                key={category.id}
                className="grid gap-3 p-4 xl:grid-cols-[1fr_1.6fr_9rem_5rem_auto] xl:items-end"
              >
                <label className="text-xs font-bold text-slate-600">
                  Label
                  <input
                    value={category.label}
                    onChange={(event) => updateCategory(category.id, { label: event.target.value })}
                    className={FIELD_CLASS}
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Description
                  <input
                    value={category.description || ''}
                    onChange={(event) =>
                      updateCategory(category.id, { description: event.target.value })
                    }
                    className={FIELD_CLASS}
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Icon
                  <select
                    value={category.icon_key}
                    onChange={(event) =>
                      updateCategory(category.id, { icon_key: event.target.value })
                    }
                    className={FIELD_CLASS}
                  >
                    {ICON_OPTIONS.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Order
                  <input
                    type="number"
                    min={0}
                    value={category.display_order}
                    onChange={(event) =>
                      updateCategory(category.id, { display_order: Number(event.target.value) })
                    }
                    className={FIELD_CLASS}
                  />
                </label>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <span
                    title="Stable key"
                    className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-500"
                  >
                    {category.category_key}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={category.supplier_payments_enabled}
                      onChange={(event) =>
                        updateCategory(category.id, {
                          supplier_payments_enabled: event.target.checked,
                        })
                      }
                    />{' '}
                    Pay suppliers
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold">
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
                    type="button"
                    onClick={() => void saveCategory(category)}
                    disabled={busy !== '' || !data.configurationReady}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'services' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Services and subservices"
            description="Configure how each Quick Transaction service behaves. Loyalty is managed elsewhere."
          />
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-xs font-bold text-slate-600">
              Show category
              <select
                aria-label="Service category filter"
                value={serviceCategoryFilter}
                onChange={(event) => setServiceCategoryFilter(event.target.value)}
                className="ml-2 h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="">All categories</option>
                {data.categories.map((row) => (
                  <option key={row.id} value={row.category_key}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[11px] font-bold text-slate-400">
              {visibleServices.length} configured service{visibleServices.length === 1 ? '' : 's'}
            </span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const category = data.categories.find(
                (row) => row.category_key === newService.categoryKey,
              )
              if (!category) return
              if (hasDuplicateService(newService.key, newService.label, category.id)) {
                toast.error('A service already uses this key or active label in the category.')
                return
              }
              void mutate('new-service', {
                action: 'UPSERT_SERVICE',
                key: newService.key,
                categoryKey: newService.categoryKey,
                label: newService.label,
                classification: newService.direction === 'OUT' ? 'EXPENSE' : 'SERVICE',
                direction: newService.direction,
                displayOrder: 100,
                logoKey: null,
                allowedPaymentMethods: ['CASH', 'CARD', 'BANK'],
                customerRequired: false,
                noteRequired: newService.direction === 'OUT',
                priceRequired: false,
                sourceRequired: false,
                isActive: true,
              }).then((saved) => saved && setNewService({ ...newService, key: '', label: '' }))
            }}
            className="grid gap-2 border-b border-slate-200 bg-emerald-50/40 p-4 lg:grid-cols-[1fr_1fr_1fr_8rem_auto]"
          >
            <select
              value={newService.categoryKey}
              onChange={(event) =>
                setNewService({ ...newService, categoryKey: event.target.value })
              }
              className={SMALL_FIELD_CLASS}
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
                setNewService({ ...newService, key: slugify(event.target.value) })
              }
              placeholder="Stable service key"
              className={SMALL_FIELD_CLASS}
            />
            <input
              required
              value={newService.label}
              onChange={(event) => setNewService({ ...newService, label: event.target.value })}
              placeholder="Service label"
              className={SMALL_FIELD_CLASS}
            />
            <select
              value={newService.direction}
              onChange={(event) =>
                setNewService({ ...newService, direction: event.target.value as 'IN' | 'OUT' })
              }
              className={SMALL_FIELD_CLASS}
            >
              <option value="IN">Money in</option>
              <option value="OUT">Money out</option>
            </select>
            <button
              disabled={busy !== '' || !data.configurationReady}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-black text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add service
            </button>
          </form>
          <div className="grid gap-3 p-4 xl:grid-cols-2">
            {visibleServices.map((service) => {
              const category = data.categories.find((row) => row.id === service.category_id)
              const protectedContract =
                Boolean(service.tracked_source_type) ||
                ['donation', 'other-income'].includes(service.item_key)
              return (
                <article
                  key={service.id}
                  className="space-y-3 rounded-xl border border-slate-200 p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                        {category?.label || 'Category'}
                      </p>
                      <p className="font-mono text-[10px] text-slate-400">{service.item_key}</p>
                    </div>
                    {service.tracked_source_type && (
                      <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                        {service.tracked_source_type} linked
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_7rem_5rem]">
                    <label className="text-xs font-bold text-slate-600">
                      Label
                      <input
                        value={service.label}
                        onChange={(event) =>
                          updateService(service.id, { label: event.target.value })
                        }
                        className={FIELD_CLASS}
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Category
                      <select
                        value={service.category_id}
                        disabled={Boolean(service.tracked_source_type)}
                        onChange={(event) =>
                          updateService(service.id, { category_id: event.target.value })
                        }
                        className={FIELD_CLASS}
                      >
                        {data.categories.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Direction
                      <select
                        value={service.default_direction}
                        disabled={protectedContract}
                        onChange={(event) =>
                          updateService(service.id, {
                            default_direction: event.target.value as 'IN' | 'OUT',
                            classification: event.target.value === 'OUT' ? 'EXPENSE' : 'SERVICE',
                          })
                        }
                        className={FIELD_CLASS}
                      >
                        <option value="IN">Money in</option>
                        <option value="OUT">Money out</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Order
                      <input
                        type="number"
                        min={0}
                        value={service.display_order}
                        onChange={(event) =>
                          updateService(service.id, { display_order: Number(event.target.value) })
                        }
                        className={FIELD_CLASS}
                      />
                    </label>
                  </div>
                  <fieldset>
                    <legend className="text-xs font-bold text-slate-600">
                      Allowed payment methods
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(['CASH', 'CARD', 'BANK'] as const).map((method) => (
                        <label
                          key={method}
                          className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] font-bold"
                        >
                          <input
                            type="checkbox"
                            checked={service.allowed_payment_methods.includes(method)}
                            onChange={(event) => {
                              const methods = event.target.checked
                                ? [...new Set([...service.allowed_payment_methods, method])]
                                : service.allowed_payment_methods.filter(
                                    (value) => value !== method,
                                  )
                              if (methods.length)
                                updateService(service.id, { allowed_payment_methods: methods })
                            }}
                          />{' '}
                          {method[0] + method.slice(1).toLocaleLowerCase()}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['Customer required', 'customer_required'],
                      ['Note required', 'note_required'],
                      ['Price required', 'price_required'],
                      ['Source reference required', 'source_required'],
                      ['Active', 'is_active'],
                    ].map(([label, field]) => (
                      <label
                        key={field}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold"
                      >
                        <input
                          type="checkbox"
                          disabled={
                            field === 'source_required' && Boolean(service.tracked_source_type)
                          }
                          checked={Boolean(service[field as keyof ServiceRow])}
                          onChange={(event) =>
                            updateService(service.id, { [field]: event.target.checked })
                          }
                        />{' '}
                        {label}
                      </label>
                    ))}
                  </div>
                  <LogoEditor
                    kind="service"
                    label={service.label}
                    logoKey={service.logo_key}
                    logoUrl={service.logo_url}
                    disabled={!data.configurationReady || busy !== ''}
                    onChange={(logoKey, logoUrl) =>
                      updateService(service.id, { logo_key: logoKey, logo_url: logoUrl })
                    }
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-slate-500">
                      Loyalty eligibility and rates are preserved but edited only in the Loyalty
                      module.
                    </p>
                    <button
                      type="button"
                      onClick={() => void saveService(service)}
                      disabled={busy !== '' || !data.configurationReady}
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" /> Save service
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {activeTab === 'suppliers' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Suppliers"
            description="Manage unique supplier identities, matching aliases, settlement behavior and logos."
          />
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const aliases = newSupplier.aliases
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
              if (hasDuplicateSupplier(newSupplier.name, aliases)) {
                toast.error('A supplier name or alias is already in use.')
                return
              }
              void mutate('new-supplier', {
                action: 'UPSERT_SUPPLIER',
                name: newSupplier.name,
                aliases,
                sourceArea: newSupplier.sourceArea || undefined,
                sourceReference: newSupplier.sourceReference || undefined,
                settlementMode: newSupplier.settlementMode,
                logoKey: newSupplier.logoKey,
                isActive: true,
              }).then(
                (saved) =>
                  saved &&
                  setNewSupplier({
                    name: '',
                    aliases: '',
                    sourceArea: '',
                    sourceReference: '',
                    settlementMode: 'DEPOSIT_ACCOUNT',
                    logoKey: null,
                    logoUrl: null,
                  }),
              )
            }}
            className="grid gap-3 border-b border-slate-200 bg-emerald-50/40 p-4 lg:grid-cols-[1fr_1fr]"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                required
                value={newSupplier.name}
                onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })}
                placeholder="Supplier name"
                className={SMALL_FIELD_CLASS}
              />
              <input
                value={newSupplier.aliases}
                onChange={(event) =>
                  setNewSupplier({ ...newSupplier, aliases: event.target.value })
                }
                placeholder="Matching aliases, comma separated"
                className={SMALL_FIELD_CLASS}
              />
              <input
                value={newSupplier.sourceArea}
                onChange={(event) =>
                  setNewSupplier({ ...newSupplier, sourceArea: event.target.value })
                }
                placeholder="Source area, e.g. Ticketing"
                className={SMALL_FIELD_CLASS}
              />
              <input
                value={newSupplier.sourceReference}
                onChange={(event) =>
                  setNewSupplier({ ...newSupplier, sourceReference: event.target.value })
                }
                placeholder="External reference (optional)"
                className={SMALL_FIELD_CLASS}
              />
              <select
                aria-label="New supplier settlement mode"
                value={newSupplier.settlementMode}
                onChange={(event) =>
                  setNewSupplier({
                    ...newSupplier,
                    settlementMode: event.target.value as typeof newSupplier.settlementMode,
                  })
                }
                className={SMALL_FIELD_CLASS}
              >
                <option value="DEPOSIT_ACCOUNT">Deposit account</option>
                <option value="PAY_ON_DEMAND">Pay on demand</option>
              </select>
              <button
                disabled={busy !== '' || !data.configurationReady}
                className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-black text-white disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add supplier
              </button>
            </div>
            <LogoEditor
              kind="supplier"
              label={newSupplier.name || 'New supplier'}
              logoKey={newSupplier.logoKey}
              logoUrl={newSupplier.logoUrl}
              disabled={!data.configurationReady || busy !== ''}
              onChange={(logoKey, logoUrl) => setNewSupplier({ ...newSupplier, logoKey, logoUrl })}
            />
          </form>
          <div className="grid gap-3 p-4 xl:grid-cols-2">
            {data.suppliers.map((supplier) => (
              <article
                key={supplier.supplier_vendor_id}
                className="space-y-3 rounded-xl border border-slate-200 p-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-black ${supplier.is_system ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {supplier.is_system ? 'Protected supplier' : 'Custom supplier'}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={supplier.is_active}
                      onChange={(event) =>
                        updateSupplier(supplier.supplier_vendor_id, {
                          is_active: event.target.checked,
                        })
                      }
                    />{' '}
                    Active
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">
                    Name
                    <input
                      aria-label={`${supplier.name} name`}
                      value={supplier.name}
                      disabled={supplier.is_system}
                      onChange={(event) =>
                        updateSupplier(supplier.supplier_vendor_id, { name: event.target.value })
                      }
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Settlement
                    <select
                      aria-label={`${supplier.name} settlement mode`}
                      value={supplier.settlement_mode}
                      disabled={supplier.is_system}
                      onChange={(event) =>
                        updateSupplier(supplier.supplier_vendor_id, {
                          settlement_mode: event.target.value as SupplierRow['settlement_mode'],
                        })
                      }
                      className={FIELD_CLASS}
                    >
                      <option value="DEPOSIT_ACCOUNT">Deposit account</option>
                      <option value="PAY_ON_DEMAND">Pay on demand</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                    Aliases
                    <input
                      aria-label={`${supplier.name} aliases`}
                      value={supplier.alternate_names.join(', ')}
                      onChange={(event) =>
                        updateSupplier(supplier.supplier_vendor_id, {
                          alternate_names: event.target.value
                            .split(',')
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Comma-separated matching names"
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Source area
                    <input
                      value={supplier.source_area || ''}
                      onChange={(event) =>
                        updateSupplier(supplier.supplier_vendor_id, {
                          source_area: event.target.value,
                        })
                      }
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    External reference
                    <input
                      value={supplier.source_reference || ''}
                      onChange={(event) =>
                        updateSupplier(supplier.supplier_vendor_id, {
                          source_reference: event.target.value,
                        })
                      }
                      className={FIELD_CLASS}
                    />
                  </label>
                </div>
                <LogoEditor
                  kind="supplier"
                  label={supplier.name}
                  logoKey={supplier.logo_key}
                  logoUrl={supplier.logo_url}
                  disabled={!data.configurationReady || busy !== ''}
                  onChange={(logoKey, logoUrl) =>
                    updateSupplier(supplier.supplier_vendor_id, {
                      logo_key: logoKey,
                      logo_url: logoUrl,
                    })
                  }
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveSupplier(supplier)}
                    disabled={busy !== '' || !data.configurationReady}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> Save supplier
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'assignments' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Category-to-supplier assignments"
            description="Controls exactly which suppliers appear after staff choose a supplier-payment category."
          />
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!assignment.supplierId) {
                toast.error('Choose an unassigned supplier.')
                return
              }
              void mutate('assignment', { action: 'SET_ASSIGNMENT', ...assignment, isActive: true })
            }}
            className="grid gap-2 border-b border-slate-200 bg-emerald-50/40 p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-center"
          >
            <select
              aria-label="Assignment category"
              value={assignment.categoryKey}
              onChange={(event) =>
                setAssignment({ ...assignment, categoryKey: event.target.value, supplierId: '' })
              }
              className={SMALL_FIELD_CLASS}
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
              aria-label="Assignment supplier"
              value={assignment.supplierId}
              onChange={(event) => setAssignment({ ...assignment, supplierId: event.target.value })}
              className={SMALL_FIELD_CLASS}
            >
              <option value="">Choose unassigned supplier</option>
              {availableAssignmentSuppliers.map((row) => (
                <option key={row.supplier_vendor_id} value={row.supplier_vendor_id}>
                  {row.name}
                </option>
              ))}
            </select>
            <label className="flex h-8 items-center gap-1.5 text-xs font-bold">
              <input
                type="checkbox"
                checked={assignment.isDefault}
                onChange={(event) =>
                  setAssignment({ ...assignment, isDefault: event.target.checked })
                }
              />{' '}
              Default for category
            </label>
            <button
              disabled={busy !== '' || !data.configurationReady || !assignment.supplierId}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-black text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add assignment
            </button>
          </form>
          <div className="space-y-4 p-4">
            {data.categories
              .filter((category) => category.supplier_payments_enabled)
              .map((category) => {
                const rows = activeAssignments.filter((row) => row.category_id === category.id)
                return (
                  <article key={category.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-900">{category.label}</p>
                        <p className="text-[10px] text-slate-500">
                          {rows.length} supplier{rows.length === 1 ? '' : 's'} available in POS
                        </p>
                      </div>
                      <Store className="h-4 w-4 text-emerald-700" />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {rows.map((row) => {
                        const supplier = data.suppliers.find(
                          (item) => item.supplier_vendor_id === row.supplier_vendor_id,
                        )
                        if (!supplier) return null
                        return (
                          <div
                            key={`${row.category_id}-${row.supplier_vendor_id}`}
                            className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-slate-800">
                                {supplier.name}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {row.is_default
                                  ? 'Default supplier'
                                  : supplier.settlement_mode === 'DEPOSIT_ACCOUNT'
                                    ? 'Deposit account'
                                    : 'Pay on demand'}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              {!row.is_default && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void mutate(
                                      `default-${row.category_id}-${row.supplier_vendor_id}`,
                                      {
                                        action: 'SET_ASSIGNMENT',
                                        categoryKey: category.category_key,
                                        supplierId: row.supplier_vendor_id,
                                        isDefault: true,
                                        isActive: true,
                                      },
                                    )
                                  }
                                  disabled={busy !== '' || !data.configurationReady}
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600"
                                >
                                  Make default
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`Remove ${supplier.name} from ${category.label}`}
                                onClick={() =>
                                  void mutate(
                                    `unassign-${row.category_id}-${row.supplier_vendor_id}`,
                                    {
                                      action: 'SET_ASSIGNMENT',
                                      categoryKey: category.category_key,
                                      supplierId: row.supplier_vendor_id,
                                      isDefault: false,
                                      isActive: false,
                                    },
                                  )
                                }
                                disabled={busy !== '' || !data.configurationReady}
                                className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-700"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {rows.length === 0 && (
                        <p className="text-xs text-slate-400">No suppliers assigned.</p>
                      )}
                    </div>
                  </article>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}

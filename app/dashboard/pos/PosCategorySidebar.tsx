import Image from 'next/image'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { Fragment, type ComponentType } from 'react'

export type IconComponent = ComponentType<{ className?: string }>

export type CategoryPreset = {
  id: string
  categoryKey?: string
  label: string
  caption: string
  icon: IconComponent
  tone: string
  direction: 'IN' | 'OUT' | 'TRANSFER'
  loyalty: boolean
  logoKey?: string | null
  logoUrl?: string | null
}

export type CategoryMenuItem =
  | { id: string; label: string; caption: string; icon: IconComponent; children: string[] }
  | { id: string; categoryId: string }

type PosCategorySidebarProps = {
  categoryMenu: CategoryMenuItem[]
  availableCategories: CategoryPreset[]
  categoryId: string
  expandedCategoryGroups: string[]
  isSupplierPayment: boolean
  onStartSupplierPayment: () => void
  onChooseCategory: (category: CategoryPreset, categoryGroupId?: string) => void
  onToggleCategoryGroup: (groupId: string) => void
}

const CATEGORY_GROUP_TONES: Record<string, string> = {
  applications: 'border-sky-200 bg-sky-50 text-sky-800',
  'ticketing-packages': 'border-violet-200 bg-violet-50 text-violet-800',
  remittance: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cargo: 'border-amber-200 bg-amber-50 text-amber-900',
  'document-assistance': 'border-indigo-200 bg-indigo-50 text-indigo-800',
  other: 'border-rose-200 bg-rose-50 text-rose-800',
}

export default function PosCategorySidebar({
  categoryMenu,
  availableCategories,
  categoryId,
  expandedCategoryGroups,
  isSupplierPayment,
  onStartSupplierPayment,
  onChooseCategory,
  onToggleCategoryGroup,
}: PosCategorySidebarProps) {
  return (
    <aside
      data-pos-tour="categories"
      className="order-2 flex min-h-0 flex-col self-stretch overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white p-2.5 shadow-sm xl:order-3 xl:mb-7"
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
            Quick entry
          </p>
          <h2 className="text-sm font-black text-slate-950">Categories</h2>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 xl:hidden" />
      </div>
      <button
        type="button"
        data-pos-tour="pay-supplier"
        onClick={onStartSupplierPayment}
        title="Record a supplier deposit or a negative deposit correction"
        className={`mb-2 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-black transition ${
          isSupplierPayment
            ? 'border-amber-700 bg-amber-700 text-white'
            : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
        }`}
      >
        <Building2 className="h-4 w-4" />
        Pay supplier
      </button>
      <div
        data-pos-tour="category-grid"
        className="grid min-h-0 max-h-[31rem] flex-1 auto-rows-min grid-cols-2 gap-1.5 overflow-y-auto pr-1 xl:max-h-none"
      >
        {categoryMenu.map((menuItem) => {
          if ('children' in menuItem) {
            const Icon = menuItem.icon
            const expanded = expandedCategoryGroups.includes(menuItem.id)
            const childSelected = menuItem.children.includes(categoryId)

            return (
              <Fragment key={menuItem.id}>
                <button
                  type="button"
                  onClick={() => {
                    const onlyChild =
                      menuItem.children.length === 1
                        ? availableCategories.find((item) => item.id === menuItem.children[0])
                        : null
                    if (onlyChild) onChooseCategory(onlyChild)
                    else onToggleCategoryGroup(menuItem.id)
                  }}
                  aria-label={`${menuItem.label} ${menuItem.caption}`}
                  aria-expanded={expanded}
                  aria-controls={`${menuItem.id}-subcategories`}
                  title={menuItem.caption}
                  className={`flex aspect-square w-full flex-col justify-between rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                    expanded || childSelected
                      ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
                      : CATEGORY_GROUP_TONES[menuItem.id] || 'border-sky-200 bg-sky-50 text-sky-800'
                  }`}
                >
                  <span className="flex w-full items-start justify-between">
                    <Icon className="h-4 w-4" />
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </span>
                  <span>
                    <span className="block text-[11px] font-black leading-tight">
                      {menuItem.label}
                    </span>
                    <span className="mt-0.5 block text-[9px] font-medium leading-tight opacity-65">
                      {menuItem.caption}
                    </span>
                  </span>
                </button>

                {expanded && (
                  <div
                    id={`${menuItem.id}-subcategories`}
                    className="col-span-2 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5"
                  >
                    {menuItem.children.map((childId) => {
                      const category = availableCategories.find((item) => item.id === childId)
                      if (!category) return null
                      const selected = category.id === categoryId

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => onChooseCategory(category, menuItem.id)}
                          aria-label={category.label}
                          aria-pressed={selected}
                          title={
                            menuItem.id === 'remittance'
                              ? `Select ${category.label} as the remittance provider`
                              : category.caption || `Select ${category.label}`
                          }
                          className={`flex min-h-8 w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[11px] font-black shadow-sm transition hover:translate-x-0.5 ${
                            selected ? 'border-[#8b1e2d] bg-[#8b1e2d] text-white' : category.tone
                          }`}
                        >
                          <span>
                            <span className="flex items-center gap-2">
                              {(category.logoUrl || category.logoKey) && (
                                <Image
                                  src={category.logoUrl || `/pos/providers/${category.logoKey}.svg`}
                                  alt=""
                                  width={42}
                                  height={18}
                                  unoptimized
                                  className="h-3.5 w-auto max-w-12 object-contain"
                                />
                              )}
                              <span className="block">{category.label}</span>
                            </span>
                            {menuItem.id !== 'remittance' && category.caption && (
                              <span
                                className={`block text-[9px] font-medium leading-tight ${selected ? 'text-red-100' : 'opacity-65'}`}
                              >
                                {category.caption}
                              </span>
                            )}
                          </span>
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Fragment>
            )
          }

          const category = availableCategories.find((item) => item.id === menuItem.categoryId)
          if (!category) return null
          const Icon = category.icon
          const selected = category.id === categoryId

          return (
            <button
              key={menuItem.id}
              type="button"
              onClick={() => onChooseCategory(category)}
              aria-label={`${category.label} ${category.caption}`}
              aria-pressed={selected}
              title={category.caption || `Select ${category.label}`}
              className={`flex aspect-square w-full flex-col justify-between rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                selected
                  ? 'border-[#8b1e2d] bg-[#8b1e2d] text-white shadow-sm'
                  : `${category.tone} hover:border-slate-300`
              }`}
            >
              <span className="flex w-full items-start justify-between">
                <Icon className="h-4 w-4 shrink-0" />
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </span>
              <span>
                <span className="block text-[11px] font-black leading-tight">{category.label}</span>
                <span
                  className={`mt-0.5 block text-[9px] leading-tight ${selected ? 'text-red-100' : 'opacity-65'}`}
                >
                  {category.caption}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

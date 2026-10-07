import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PosCategorySidebar, {
  type CategoryMenuItem,
  type CategoryPreset,
} from '@/app/dashboard/pos/PosCategorySidebar'

const Icon = ({ className }: { className?: string }) => (
  <span aria-hidden="true" className={className} />
)

const categories: CategoryPreset[] = [
  {
    id: 'ria-remittance',
    categoryKey: 'remittance',
    label: 'Ria',
    caption: 'Provider fee',
    icon: Icon,
    tone: 'border-sky-200 bg-sky-50 text-sky-800',
    direction: 'IN',
    loyalty: true,
  },
  {
    id: 'moneygram-remittance',
    categoryKey: 'remittance',
    label: 'MoneyGram',
    caption: 'Provider fee',
    icon: Icon,
    tone: 'border-rose-200 bg-rose-50 text-rose-800',
    direction: 'IN',
    loyalty: true,
  },
]

const groupedMenu: CategoryMenuItem[] = [
  {
    id: 'remittance',
    label: 'Remittance',
    caption: 'Choose an approved provider',
    icon: Icon,
    children: categories.map((category) => category.id),
  },
]

describe('POS category sidebar', () => {
  it('delegates group expansion, category selection, and supplier payment setup', () => {
    const onToggleCategoryGroup = vi.fn()
    const onChooseCategory = vi.fn()
    const onStartSupplierPayment = vi.fn()
    const props = {
      categoryMenu: groupedMenu,
      availableCategories: categories,
      categoryId: 'ria-remittance',
      expandedCategoryGroups: [] as string[],
      isSupplierPayment: false,
      onStartSupplierPayment,
      onChooseCategory,
      onToggleCategoryGroup,
    }

    const { rerender } = render(<PosCategorySidebar {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remittance Choose an approved provider' }))
    expect(onToggleCategoryGroup).toHaveBeenCalledWith('remittance')
    fireEvent.click(screen.getByRole('button', { name: 'Pay supplier' }))
    expect(onStartSupplierPayment).toHaveBeenCalledOnce()

    rerender(<PosCategorySidebar {...props} expandedCategoryGroups={['remittance']} />)
    expect(screen.getByRole('button', { name: 'Ria' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'MoneyGram' }))
    expect(onChooseCategory).toHaveBeenCalledWith(categories[1], 'remittance')
  })

  it('selects a single-child category directly instead of expanding an empty group', () => {
    const onChooseCategory = vi.fn()
    const onToggleCategoryGroup = vi.fn()
    const singleCategoryMenu: CategoryMenuItem[] = [
      {
        id: 'remittance',
        label: 'Remittance',
        caption: 'Choose an approved provider',
        icon: Icon,
        children: ['ria-remittance'],
      },
    ]

    render(
      <PosCategorySidebar
        categoryMenu={singleCategoryMenu}
        availableCategories={categories}
        categoryId="moneygram-remittance"
        expandedCategoryGroups={[]}
        isSupplierPayment
        onStartSupplierPayment={() => {}}
        onChooseCategory={onChooseCategory}
        onToggleCategoryGroup={onToggleCategoryGroup}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remittance Choose an approved provider' }))
    expect(onChooseCategory).toHaveBeenCalledWith(categories[0])
    expect(onToggleCategoryGroup).not.toHaveBeenCalled()
  })

  it('selects a direct category item without a group', () => {
    const onChooseCategory = vi.fn()
    const directMenuItem: CategoryMenuItem[] = [
      { id: 'provider-shortcut', categoryId: 'moneygram-remittance' },
    ]

    render(
      <PosCategorySidebar
        categoryMenu={directMenuItem}
        availableCategories={categories}
        categoryId="ria-remittance"
        expandedCategoryGroups={[]}
        isSupplierPayment={false}
        onStartSupplierPayment={() => {}}
        onChooseCategory={onChooseCategory}
        onToggleCategoryGroup={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'MoneyGram Provider fee' }))
    expect(onChooseCategory).toHaveBeenCalledWith(categories[1])
  })
})

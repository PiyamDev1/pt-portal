import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  FlightOptionEditor,
  newLinkedFlightGroup,
  OptionEditor,
} from '@/app/dashboard/packages/PackageOptionEditors'
import type { PackageComponentOption } from '@/app/types/packages'

function buildFlightOption(): PackageComponentOption {
  return {
    id: 'flight-1',
    title: 'British Airways direct',
    summary: 'London to Jeddah',
    price: 0,
    pricingMode: 'per_person',
    isDefault: true,
    adultPrice: 500,
    childPrice: 400,
    infantPrice: 100,
  }
}

describe('PackageOptionEditors', () => {
  it('keeps linked-flight defaults together and forwards arrangement edits', () => {
    const option = buildFlightOption()
    const linkedGroup = {
      ...newLinkedFlightGroup(option.id),
      id: 'linked-1',
      routeLabel: 'Madinah to London',
    }
    const onChange = vi.fn()
    const onAddLinkedGroup = vi.fn()
    const onChangeLinkedGroup = vi.fn()

    const includedOption = linkedGroup.options.find((candidate) => candidate.isDefault)
    expect(linkedGroup.baseFlightOptionId).toBe(option.id)
    expect(linkedGroup.defaultOptionId).toBe(includedOption?.id)
    expect(linkedGroup.options).toHaveLength(2)

    render(
      <FlightOptionEditor
        option={option}
        optionIndex={0}
        linkedGroups={[linkedGroup]}
        onChange={onChange}
        onRemove={vi.fn()}
        onAddLinkedGroup={onAddLinkedGroup}
        onChangeLinkedGroup={onChangeLinkedGroup}
        onRemoveLinkedGroup={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Flight option'), {
      target: { value: 'Updated direct flight' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...option,
      title: 'Updated direct flight',
    })

    fireEvent.change(screen.getByPlaceholderText('Madinah to London'), {
      target: { value: 'Makkah to London' },
    })
    expect(onChangeLinkedGroup).toHaveBeenCalledWith('linked-1', {
      ...linkedGroup,
      routeLabel: 'Makkah to London',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add another journey leg' }))
    expect(onAddLinkedGroup).toHaveBeenCalledTimes(1)
  })

  it('owns transient expansion while the parent retains quote draft ownership', () => {
    const option = buildFlightOption()
    render(
      <FlightOptionEditor
        option={option}
        optionIndex={0}
        linkedGroups={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onAddLinkedGroup={vi.fn()}
        onChangeLinkedGroup={vi.fn()}
        onRemoveLinkedGroup={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse flight option' }))
    expect(screen.queryByPlaceholderText('Flight option')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand flight option' }))
    expect(screen.getByPlaceholderText('Flight option')).toBeTruthy()
  })

  it('reuses the option editor contract for preferred and audited hotel options', () => {
    const option: PackageComponentOption = {
      id: 'hotel-1',
      title: 'Makkah hotel',
      summary: 'Seven nights',
      price: 750,
      searchPrice: 700,
      adjustedPrice: 750,
      pricingMode: 'total',
      isDefault: false,
    }
    const onChange = vi.fn()

    render(
      <OptionEditor
        option={option}
        onChange={onChange}
        onRemove={vi.fn()}
        titlePlaceholder="Hotel option"
        summaryPlaceholder="Hotel details"
        showHotelCostAudit
        showDefaultToggle
        canRemove
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mark preferred' }))
    expect(onChange).toHaveBeenCalledWith({ ...option, isDefault: true })

    fireEvent.click(screen.getByRole('button', { name: 'Add extra' }))
    expect(onChange).toHaveBeenLastCalledWith({
      ...option,
      hotelAddonOptions: [
        expect.objectContaining({
          label: '',
          searchPrice: 0,
          adjustedPrice: 0,
          price: 0,
        }),
      ],
    })
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplacementCasesClient } from '@/app/dashboard/ticketing/replacement-cases/ReplacementCasesClient'

describe('ReplacementCasesClient', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          items: [],
          context: {
            employeeId: '30000000-0000-4000-8000-000000000001',
            canManageTeam: true,
            employees: [
              {
                id: '30000000-0000-4000-8000-000000000001',
                fullName: 'Agent A',
              },
            ],
          },
        }),
      ),
    )
  })

  it('offers guided entry, saved cases and searchable scenario guidance', async () => {
    render(<ReplacementCasesClient />)

    expect(screen.getByRole('heading', { name: 'Replacement Cases' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /New replacement case/ })).toBeTruthy()
    await screen.findByRole('button', { name: 'Saved cases (0)' })
    fireEvent.click(screen.getByRole('button', { name: 'Guidelines & scenarios' }))

    expect(screen.getByRole('heading', { name: 'What should I enter?' })).toBeTruthy()
    expect(screen.getByText('Fare expired after the customer paid')).toBeTruthy()
    expect(screen.getByText('A replacement ticket is later cancelled and rebooked')).toBeTruthy()

    expect(screen.getByText('Worked example')).toBeTruthy()
    expect(screen.getByText(/employee recovery £112\.59/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search scenarios'), {
      target: { value: 'ordinary date change' },
    })
    expect(screen.getByText('Ordinary date change on the same ticket')).toBeTruthy()
    expect(screen.queryByText('Fare expired after the customer paid')).toBeNull()
  })
})

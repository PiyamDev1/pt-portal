import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EditModal from '@/app/dashboard/applications/passports-gb/components/EditModal'
import { pakPassportApi } from '@/app/dashboard/applications/passports/components/api'

const editFormData = {
  id: 'gb-1',
  applicantName: 'Test User',
  applicantPassport: '',
  dateOfBirth: '',
  phoneNumber: '',
  pexNumber: '',
  status: 'Pending Submission',
}

describe('application deletion verification', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the canonical fresh-factor fields for Pakistani passport deletion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deletedPassportApplicationId: 'pak-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await pakPassportApi.deleteRecord('pak-1', '123 456', 'staff-1')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(options.body))).toEqual({
      action: 'delete',
      id: 'pak-1',
      verificationCode: '123 456',
      verificationMethod: 'auto',
      userId: 'staff-1',
    })
  })

  it('keeps the entered code when GB deletion fails so the user can retry', async () => {
    const onDelete = vi.fn().mockResolvedValue(false)

    render(
      <EditModal
        isOpen
        editFormData={editFormData}
        setEditFormData={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
        onDelete={onDelete}
      />,
    )

    const input = screen.getByLabelText('Authenticator or backup code') as HTMLInputElement
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete record' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('123456'))
    expect(input.value).toBe('123456')
  })
})

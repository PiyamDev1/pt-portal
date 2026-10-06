import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  TravelPackageDocumentCategory,
  TravelPackageThirdPartyDocumentShare,
} from '@/app/types/packages'
import { PackageThirdPartyDocumentAccessPanel } from '@/app/dashboard/packages/[id]/PackageThirdPartyDocumentAccessPanel'

function createShare(
  overrides: Partial<TravelPackageThirdPartyDocumentShare> = {},
): TravelPackageThirdPartyDocumentShare {
  return {
    id: 'share-1',
    package_id: 'package-1',
    created_by: null,
    updated_by: null,
    label: 'Hotel supplier',
    recipient_name: 'Makkah Hotel',
    purpose: 'Reservation confirmation',
    status: 'active',
    access_code_hint: 'AB••',
    allowed_categories: ['hotel'],
    expires_at: '2026-11-01T12:00:00.000Z',
    terms_text: 'Terms',
    terms_accepted_at: null,
    terms_accepted_by: null,
    last_accessed_at: null,
    last_access_ip_hash: null,
    failed_access_count: 0,
    last_failed_at: null,
    revoked_at: null,
    revoked_by: null,
    metadata: {},
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

function createProps() {
  return {
    form: {
      label: 'Third-party document access',
      recipientName: '',
      purpose: '',
      expiresAt: '',
      allowedCategories: ['visa'] as TravelPackageDocumentCategory[],
    },
    saving: false,
    generatedShare: null,
    shares: [] as TravelPackageThirdPartyDocumentShare[],
    onFieldChange: vi.fn(),
    onToggleCategory: vi.fn(),
    onCreateShare: vi.fn(),
    onCopyShareInfo: vi.fn(),
    onRevokeShare: vi.fn(),
  }
}

describe('PackageThirdPartyDocumentAccessPanel', () => {
  it('delegates form edits, category changes, generation, and copy actions', () => {
    const props = createProps()
    props.generatedShare = {
      shareUrl: 'https://example.test/share/abc',
      accessCode: 'ABCD2345',
      recipientName: 'Hotel supplier',
    }

    render(<PackageThirdPartyDocumentAccessPanel {...props} />)

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: 'Hotel supplier' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hotels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate link/code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy share info' }))

    expect(props.onFieldChange).toHaveBeenCalledWith('recipientName', 'Hotel supplier')
    expect(props.onToggleCategory).toHaveBeenCalledWith('hotel')
    expect(props.onCreateShare).toHaveBeenCalledOnce()
    expect(props.onCopyShareInfo).toHaveBeenCalledOnce()
    expect(screen.getByText('Code: ABCD2345')).toBeTruthy()
  })

  it('shows recent active shares and delegates revocation', () => {
    const props = createProps()
    const share = createShare()
    props.shares = [share]

    render(<PackageThirdPartyDocumentAccessPanel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    expect(screen.getByText('Recent shares')).toBeTruthy()
    expect(screen.getByText('Hotel supplier')).toBeTruthy()
    expect(props.onRevokeShare).toHaveBeenCalledWith(share)
  })

  it('does not offer revocation for an already inactive share', () => {
    const props = createProps()
    props.shares = [createShare({ status: 'revoked' })]

    render(<PackageThirdPartyDocumentAccessPanel {...props} />)

    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
    expect(screen.getByText('revoked')).toBeTruthy()
  })
})

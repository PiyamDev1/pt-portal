import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TravelPackageDocument } from '@/app/types/packages'
import { PackageDocumentLibraryPanel } from '@/app/dashboard/packages/[id]/PackageDocumentLibraryPanel'

function createDocument(overrides: Partial<TravelPackageDocument> = {}): TravelPackageDocument {
  return {
    id: 'document-1',
    package_id: 'package-1',
    reservation_id: null,
    quote_id: null,
    uploaded_by: null,
    updated_by: null,
    category: 'visa',
    title: 'Visa confirmation',
    file_name: 'visa-confirmation.pdf',
    file_size: 1024,
    file_type: 'application/pdf',
    storage_provider: 'minio',
    storage_bucket: 'documents',
    storage_key: 'package-1/documents/visa.pdf',
    storage_etag: 'etag',
    status: 'draft',
    customer_visible: false,
    released_at: null,
    released_by: null,
    revoked_at: null,
    revoked_by: null,
    public_notes: null,
    internal_notes: null,
    metadata: {},
    created_at: '2026-10-01T12:30:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
  }
}

function createProps() {
  return {
    documents: [],
    loading: false,
    updatingDocumentId: null,
    renamingDocumentId: null,
    renameName: '',
    reservationTitles: new Map<string, string>(),
    visaPhotosByTravelDocumentId: {} as Record<string, TravelPackageDocument[]>,
    onRenameNameChange: vi.fn(),
    onSaveRename: vi.fn(),
    onCancelRename: vi.fn(),
    onStartRename: vi.fn(),
    onLinkPhoto: vi.fn(),
    onPreview: vi.fn(),
    onDownload: vi.fn(),
    onUpdateVisibility: vi.fn(),
    onDelete: vi.fn(),
  }
}

describe('PackageDocumentLibraryPanel', () => {
  it('groups documents and delegates preview, open, release, and delete actions', () => {
    const props = createProps()
    const document = createDocument({ reservation_id: 'reservation-1' })
    props.reservationTitles.set('reservation-1', 'Makkah hotel')

    render(<PackageDocumentLibraryPanel {...props} documents={[document]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Release' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText('Visa')).toBeTruthy()
    expect(screen.getByText('Linked to Makkah hotel')).toBeTruthy()
    expect(props.onPreview).toHaveBeenCalledWith(document)
    expect(props.onDownload).toHaveBeenCalledWith(document)
    expect(props.onUpdateVisibility).toHaveBeenCalledWith(document, true)
    expect(props.onDelete).toHaveBeenCalledWith(document)
  })

  it('nests linked visa photos under agent-only travel documents', () => {
    const props = createProps()
    const passport = createDocument({
      id: 'passport-1',
      category: 'travel_documents',
      title: 'Lead passport',
      file_name: 'passport.pdf',
    })
    const visaPhoto = createDocument({
      id: 'visa-photo-1',
      category: 'travel_documents',
      title: 'Lead visa photo',
      file_name: 'visa-photo.jpg',
      file_type: 'image/jpeg',
      metadata: {
        documentKind: 'visa_photo',
        linkedTravelDocumentId: passport.id,
        linkedTravelDocumentTitle: passport.title,
      },
    })
    props.visaPhotosByTravelDocumentId[passport.id] = [visaPhoto]

    render(<PackageDocumentLibraryPanel {...props} documents={[passport, visaPhoto]} />)

    expect(screen.getByText('Lead passport')).toBeTruthy()
    expect(screen.getByText('Linked visa photos')).toBeTruthy()
    expect(screen.getByText('Lead visa photo')).toBeTruthy()
    expect(screen.getByText('2 files')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Release' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Link photo' }))
    expect(props.onLinkPhoto).toHaveBeenCalledWith(passport)
  })

  it('offers rename controls and an empty state when appropriate', () => {
    const props = createProps()
    const document = createDocument()
    props.renamingDocumentId = document.id
    props.renameName = 'Updated visa title'

    const { rerender } = render(<PackageDocumentLibraryPanel {...props} documents={[document]} />)

    fireEvent.change(screen.getByPlaceholderText('Document name'), {
      target: { value: 'New title' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(props.onRenameNameChange).toHaveBeenCalledWith('New title')
    expect(props.onSaveRename).toHaveBeenCalledWith(document)
    expect(props.onCancelRename).toHaveBeenCalledOnce()

    rerender(<PackageDocumentLibraryPanel {...createProps()} documents={[]} />)
    expect(screen.getByText('No package documents uploaded yet.')).toBeTruthy()
  })
})

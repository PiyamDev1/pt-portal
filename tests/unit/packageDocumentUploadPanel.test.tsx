import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PackageDocumentUploadPanel } from '@/app/dashboard/packages/[id]/PackageDocumentUploadPanel'

describe('PackageDocumentUploadPanel', () => {
  it('shows category counts and delegates selected files to the package workspace', () => {
    const onUploadFiles = vi.fn()
    const onDraggingCategoryChange = vi.fn()
    const file = new File(['passport'], 'passport.pdf', { type: 'application/pdf' })

    render(
      <PackageDocumentUploadPanel
        saving={false}
        countsByCategory={{ visa: 2, travel_documents: 1 }}
        draggingCategory={null}
        onDraggingCategoryChange={onDraggingCategoryChange}
        onUploadFiles={onUploadFiles}
      />,
    )

    const visaInput = screen.getByLabelText('Upload Visa documents')
    fireEvent.change(visaInput, {
      target: { files: [file] },
    })
    const visaCategoryCard = visaInput.closest('label')
    if (!visaCategoryCard) throw new Error('Visa upload card label was not rendered')
    const dataTransfer = { files: [file] }
    fireEvent.dragOver(visaCategoryCard, { dataTransfer })
    fireEvent.drop(visaCategoryCard, { dataTransfer })

    expect(screen.getByText('2 uploaded')).toBeTruthy()
    expect(screen.getByText('Agents only')).toBeTruthy()
    expect(onUploadFiles).toHaveBeenCalledWith([file], { category: 'visa' })
    expect(onUploadFiles).toHaveBeenCalledWith(dataTransfer.files, { category: 'visa' })
    expect(onDraggingCategoryChange).toHaveBeenCalledWith('visa')
    expect(onDraggingCategoryChange).toHaveBeenCalledWith(null)
  })

  it('disables category inputs and shows upload progress while saving', () => {
    render(
      <PackageDocumentUploadPanel
        saving
        countsByCategory={{}}
        draggingCategory={null}
        onDraggingCategoryChange={vi.fn()}
        onUploadFiles={vi.fn()}
      />,
    )

    expect(screen.getByText('Uploading')).toBeTruthy()
    expect(screen.getByLabelText('Upload Flights documents').hasAttribute('disabled')).toBe(true)
  })
})

'use client'

import { Loader2, Upload } from 'lucide-react'
import type { TravelPackageDocumentCategory } from '@/app/types/packages'
import { PACKAGE_DOCUMENT_CATEGORIES } from '@/lib/packageDocuments'

type PackageDocumentUploadPanelProps = {
  saving: boolean
  countsByCategory: Partial<Record<TravelPackageDocumentCategory, number>>
  draggingCategory: TravelPackageDocumentCategory | null
  onDraggingCategoryChange: (category: TravelPackageDocumentCategory | null) => void
  onUploadFiles: (
    files: FileList | File[],
    options: { category: TravelPackageDocumentCategory },
  ) => void | Promise<void>
}

export function PackageDocumentUploadPanel({
  saving,
  countsByCategory,
  draggingCategory,
  onDraggingCategoryChange,
  onUploadFiles,
}: PackageDocumentUploadPanelProps) {
  return (
    <section className="order-4 rounded-xl border border-slate-200 bg-white xl:col-span-2">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">Upload documents</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Choose a category first, then click or drop files directly into it.
          </p>
        </div>
        {saving && (
          <span className="inline-flex items-center gap-2 text-xs font-black text-[#8b1e2d]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading
          </span>
        )}
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
        {PACKAGE_DOCUMENT_CATEGORIES.map((category) => {
          const activeDrop = draggingCategory === category.value
          return (
            <label
              key={category.value}
              onDragOver={(event) => {
                event.preventDefault()
                onDraggingCategoryChange(category.value)
              }}
              onDragLeave={() => onDraggingCategoryChange(null)}
              onDrop={(event) => {
                event.preventDefault()
                onDraggingCategoryChange(null)
                const files = event.dataTransfer.files
                if (files?.length) {
                  void onUploadFiles(files, { category: category.value })
                }
              }}
              className={`group flex min-h-24 cursor-pointer items-start justify-between gap-3 rounded-lg border-2 border-dashed p-3 transition ${
                activeDrop
                  ? 'border-[#8b1e2d] bg-red-50'
                  : 'border-slate-300 bg-slate-50 hover:border-[#8b1e2d]/50 hover:bg-white'
              }`}
            >
              <input
                type="file"
                aria-label={`Upload ${category.label} documents`}
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={saving}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files || [])
                  event.currentTarget.value = ''
                  if (files.length) {
                    void onUploadFiles(files, { category: category.value })
                  }
                }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-950">{category.label}</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  {countsByCategory[category.value] || 0} uploaded
                </span>
                {category.agentOnly && (
                  <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black uppercase text-amber-800">
                    Agents only
                  </span>
                )}
                <span className="mt-2 block text-[11px] font-semibold text-slate-500">
                  Drop files or click to upload
                </span>
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#8b1e2d] shadow-sm ring-1 ring-slate-200 transition group-hover:bg-[#8b1e2d] group-hover:text-white">
                <Upload className="h-4 w-4" />
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import type {
  TravelPackageDocument,
  TravelPackageFolder,
} from '@/app/types/packages'
import {
  getPackageDocumentCategoryLabel,
  groupPackageDocumentsByCategory,
} from '@/lib/packageDocuments'

type PackageDocumentPortalClientProps = {
  token: string
}

type PortalResponse = {
  package?: TravelPackageFolder
  documents?: TravelPackageDocument[]
  error?: string
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatFileSize(bytes: number) {
  if (!bytes) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PackageDocumentPortalClient({ token }: PackageDocumentPortalClientProps) {
  const [packageFolder, setPackageFolder] = useState<TravelPackageFolder | null>(null)
  const [documents, setDocuments] = useState<TravelPackageDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDocuments = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/package-documents/${encodeURIComponent(token)}`)
        const data = (await response.json()) as PortalResponse
        if (!response.ok || !data.package) {
          throw new Error(data.error || 'Package documents are not available')
        }
        setPackageFolder(data.package)
        setDocuments(data.documents || [])
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load documents')
      } finally {
        setLoading(false)
      }
    }

    void loadDocuments()
  }, [token])

  const groupedDocuments = useMemo(() => groupPackageDocumentsByCategory(documents), [documents])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-bold">Loading package documents</span>
        </div>
      </main>
    )
  }

  if (error || !packageFolder) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-black text-slate-950">Documents unavailable</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="bg-[#4b0f16] px-4 py-6 text-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-red-100">Piyam Travel package documents</p>
            <h1 className="mt-2 text-3xl font-black">{packageFolder.package_reference}</h1>
            <p className="mt-2 text-sm font-semibold text-red-50">
              {packageFolder.customer_name || 'Customer'} · {packageFolder.destination || packageFolder.package_type}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm">
            <Image
              src="/logo.png"
              alt="Piyam Travel"
              width={92}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Departure</p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {formatDate(packageFolder.departure_date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Return</p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {formatDate(packageFolder.return_date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Released documents</p>
            <p className="mt-1 text-sm font-black text-slate-950">{documents.length}</p>
          </div>
        </section>

        {documents.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <FileText className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-black text-slate-950">No documents released yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Your agent will release flight, hotel, visa, and transport documents when they are ready.
            </p>
          </section>
        ) : (
          groupedDocuments.map((group) => (
            <section key={group.value} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-black text-slate-950">{group.label}</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {group.documents.map((document) => (
                  <article key={document.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">
                          {document.title || document.file_name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {getPackageDocumentCategoryLabel(document.category)} ·{' '}
                          {formatFileSize(document.file_size)}
                        </p>
                      </div>
                      {document.signed_url && (
                        <a
                          href={document.signed_url}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                          title="Download document"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    {document.public_notes && (
                      <p className="mt-2 text-sm leading-6 text-slate-600">{document.public_notes}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-400">
                      Released {formatDate(document.released_at || document.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  )
}

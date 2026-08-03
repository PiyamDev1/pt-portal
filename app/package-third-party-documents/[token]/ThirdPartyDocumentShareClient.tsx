'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { Download, FileText, Loader2, ShieldCheck } from 'lucide-react'
import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
} from '@/app/types/packages'
import {
  getPackageDocumentCategoryLabel,
  groupPackageDocumentsByCategory,
} from '@/lib/packageDocuments'

type ThirdPartyDocumentShareClientProps = {
  token: string
}

type ThirdPartyShareResponse = {
  share?: {
    id: string
    label: string
    recipient_name: string | null
    purpose: string | null
    allowed_categories: TravelPackageDocumentCategory[]
    expires_at: string
    terms_text: string
  }
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

export default function ThirdPartyDocumentShareClient({
  token,
}: ThirdPartyDocumentShareClientProps) {
  const [accessCode, setAccessCode] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [packageFolder, setPackageFolder] = useState<TravelPackageFolder | null>(null)
  const [documents, setDocuments] = useState<TravelPackageDocument[]>([])
  const [share, setShare] = useState<ThirdPartyShareResponse['share'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groupedDocuments = useMemo(() => groupPackageDocumentsByCategory(documents), [documents])

  const submitAccess = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/package-third-party-documents/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessCode,
            recipientName,
            acceptedTerms,
          }),
        },
      )
      const data = (await response.json()) as ThirdPartyShareResponse
      if (!response.ok || !data.package) {
        throw new Error(data.error || 'Third-party documents are not available')
      }
      setPackageFolder(data.package)
      setDocuments(data.documents || [])
      setShare(data.share || null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load documents')
    } finally {
      setLoading(false)
    }
  }

  if (!packageFolder) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
        <section className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-[#8b1e2d]">
                Piyam Travel secure document access
              </p>
              <h1 className="mt-2 text-2xl font-black text-slate-950">
                Third-party package documents
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter the access code supplied by Piyam Travel. Access is logged and documents must
                only be used for the agreed travel service purpose.
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2">
              <Image
                src="/logo.png"
                alt="Piyam Travel"
                width={88}
                height={38}
                className="h-9 w-auto object-contain"
                priority
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Recipient or company name
              </span>
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                placeholder="Company or staff member"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Access code
              </span>
              <input
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-black tracking-[0.2em] outline-none focus:border-slate-900"
                placeholder="ABC123"
              />
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                I confirm I am authorised to access these documents, will keep them secure, will not
                forward or store them unnecessarily, will delete them when no longer required, and
                accept responsibility for data breaches on my side.
              </span>
            </label>
            <button
              type="button"
              onClick={() => void submitAccess()}
              disabled={loading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#751827] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Access documents
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="bg-[#4b0f16] px-4 py-6 text-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-red-100">Third-party document access</p>
            <h1 className="mt-2 text-3xl font-black">{packageFolder.package_reference}</h1>
            <p className="mt-2 text-sm font-semibold text-red-50">
              {share?.label || 'Package documents'} · valid until {formatDate(share?.expires_at)}
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
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-black">Data handling responsibility accepted</p>
          <p className="mt-1">
            These documents contain personal data. Keep them inside your approved business systems,
            do not forward them unnecessarily, and delete them when no longer required.
          </p>
        </section>

        {documents.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <FileText className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-black text-slate-950">
              No documents are available in this share
            </p>
          </section>
        ) : (
          groupedDocuments.map((group) => (
            <section
              key={group.value}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
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
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {document.public_notes}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-400">
                      Uploaded {formatDate(document.created_at)}
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

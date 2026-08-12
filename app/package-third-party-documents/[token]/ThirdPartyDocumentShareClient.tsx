'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { Download, Eye, FileImage, FileText, Loader2, ShieldCheck, X } from 'lucide-react'
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

function isVisaPhotoDocument(document: TravelPackageDocument) {
  return document.metadata?.documentKind === 'visa_photo'
}

function getLinkedVisaPhotoParentId(document: TravelPackageDocument) {
  const linkedDocumentId = document.metadata?.linkedTravelDocumentId
  return typeof linkedDocumentId === 'string' ? linkedDocumentId : ''
}

export default function ThirdPartyDocumentShareClient({
  token,
}: ThirdPartyDocumentShareClientProps) {
  const [accessCode, setAccessCode] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTermsDialog, setShowTermsDialog] = useState(false)
  const [packageFolder, setPackageFolder] = useState<TravelPackageFolder | null>(null)
  const [documents, setDocuments] = useState<TravelPackageDocument[]>([])
  const [share, setShare] = useState<ThirdPartyShareResponse['share'] | null>(null)
  const [previewDocument, setPreviewDocument] = useState<TravelPackageDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewDocumentType = previewDocument?.file_type || ''
  const previewDocumentIsImage = previewDocumentType.startsWith('image/')
  const previewDocumentIsPdf = previewDocumentType === 'application/pdf'

  const groupedDocuments = useMemo(() => groupPackageDocumentsByCategory(documents), [documents])
  const visaPhotosByTravelDocumentId = useMemo(() => {
    return documents.filter(isVisaPhotoDocument).reduce(
      (photosByDocument, document) => {
        const parentId = getLinkedVisaPhotoParentId(document)
        if (!parentId) return photosByDocument
        photosByDocument[parentId] = [...(photosByDocument[parentId] || []), document]
        return photosByDocument
      },
      {} as Record<string, TravelPackageDocument[]>,
    )
  }, [documents])
  const renderDocumentCard = (document: TravelPackageDocument, nested = false) => (
    <article
      key={document.id}
      className={`rounded-lg border border-slate-200 bg-white p-3 ${nested ? 'ml-4 border-l-4 border-l-indigo-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">
            {document.title || document.file_name}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {isVisaPhotoDocument(document)
              ? 'Photo'
              : getPackageDocumentCategoryLabel(document.category)}{' '}
            · {formatFileSize(document.file_size)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {(document.preview_url || document.signed_url) && (
            <button
              type="button"
              onClick={() => setPreviewDocument(document)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
              title="Preview document"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          {document.signed_url && (
            <a
              href={document.signed_url}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
              title="Download document"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
      {document.public_notes && (
        <p className="mt-2 text-sm leading-6 text-slate-600">{document.public_notes}</p>
      )}
      <p className="mt-2 text-xs text-slate-400">Uploaded {formatDate(document.created_at)}</p>
    </article>
  )

  const submitAccess = async () => {
    if (!acceptedTerms) {
      setShowTermsDialog(true)
      return
    }
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
      setShowTermsDialog(false)
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
            <button
              type="button"
              onClick={() => void submitAccess()}
              disabled={loading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#751827] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Access documents
            </button>
          </div>
        </section>
        {showTermsDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
            <section className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#8b1e2d]">
                    Secure document access
                  </p>
                  <h2 className="mt-2 text-xl font-black text-slate-950">
                    Welcome {recipientName || 'there'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsDialog(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  aria-label="Close terms"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                These documents contain personal data. Before viewing them, confirm you are
                authorised to access them for the agreed travel service purpose.
              </p>
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  I will keep these documents secure, will not forward or store them unnecessarily,
                  will delete them when no longer required, and accept responsibility for data
                  breaches on my side.
                </span>
              </label>
              <button
                type="button"
                onClick={() => void submitAccess()}
                disabled={loading || !acceptedTerms}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#751827] disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Accept and view documents
              </button>
            </section>
          </div>
        )}
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
                {group.value === 'travel_documents'
                  ? group.documents
                      .filter((document) => !isVisaPhotoDocument(document))
                      .map((document) => {
                        const linkedPhotos = visaPhotosByTravelDocumentId[document.id] || []
                        return (
                          <div key={document.id} className="space-y-2">
                            {renderDocumentCard(document)}
                            {linkedPhotos.map((photo) => renderDocumentCard(photo, true))}
                          </div>
                        )
                      })
                  : group.documents.map((document) => renderDocumentCard(document))}
              </div>
            </section>
          ))
        )}
      </div>
      {previewDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <section className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-slate-500">Document preview</p>
                <h2 className="mt-1 truncate text-lg font-black text-slate-950">
                  {previewDocument.title || previewDocument.file_name}
                </h2>
                <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                  {previewDocument.file_name} · {formatFileSize(previewDocument.file_size)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {previewDocument.signed_url && (
                  <a
                    href={previewDocument.signed_url}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDocument(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-800"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-slate-100 p-4">
              {previewDocumentIsImage ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewDocument.preview_url || previewDocument.signed_url || ''}
                    alt={previewDocument.title || previewDocument.file_name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : previewDocumentIsPdf ? (
                <iframe
                  title={`Preview ${previewDocument.title || previewDocument.file_name}`}
                  src={previewDocument.preview_url || previewDocument.signed_url || ''}
                  className="h-full w-full rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
                  <FileText className="h-10 w-10 text-slate-400" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Preview is not available for this file type.
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Use Download to view the document.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

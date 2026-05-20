/**
 * Module: app/dashboard/applications/nadra/components/DocumentHub/page.tsx
 * Dashboard module for applications/nadra/components/DocumentHub/page.tsx.
 */

'use client'

/**
 * Document Hub Page
 * Main document management interface for family-level document sharing
 * All applicants in the family can access shared documents
 *
 * @page /dashboard/applications/nadra/documents/[familyHeadId]
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Document } from './types'
import { documentClient } from '@/lib/services/documentClient'
import { MinioStatus } from './MinioStatus'
import { DocumentUpload } from './DocumentUpload'
import { DocumentGrid } from './DocumentGrid'
import { DocumentPreview } from './DocumentPreview'
import { AlertCircle, Loader, DownloadCloud, Archive, RefreshCw } from 'lucide-react'

export interface DocumentHubProps {
  /**
   * Family Head ID for document context
   * All applicants in the family share these documents
   */
  familyHeadId: string

  /**
   * Family head name for page header
   */
  familyHeadName?: string

  /**
   * Optional custom subtitle under title
   */
  customSubtitle?: string

  /**
   * Show file server status bar
   */
  showStatus?: boolean

  /**
   * Custom CSS class
   */
  className?: string

  /**
   * File name (without .zip) for the generated ZIP archive.
   * Typically the applicant's tracking number or CNIC.
   * Defaults to familyHeadId if not provided.
   */
  zipFileName?: string
}

/**
 * DocumentHub Component
 * Main interface for managing family-level documents
 */
type ZipStatus = 'unknown' | 'none' | 'creating' | 'ready' | 'stale'

export function DocumentHub({
  familyHeadId,
  familyHeadName = 'Family',
  customSubtitle,
  showStatus = true,
  className = '',
  zipFileName,
}: DocumentHubProps) {
  // State management
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const DOCS_PER_PAGE = 20

  // ZIP state
  const [zipStatus, setZipStatus] = useState<ZipStatus>('unknown')
  const [zipMinioKey, setZipMinioKey] = useState<string | null>(null)
  const [zipCreatedFileName, setZipCreatedFileName] = useState<string | null>(null)

  const categorizedDocuments = useMemo(
    () => ({
      main: documents.filter((document) => !document.category || document.category === 'general'),
      review: documents.filter((document) => document.category === 'application-review'),
      receipt: documents.filter((document) => document.category === 'receipt'),
    }),
    [documents],
  )

  const totalSizeLabel = useMemo(() => {
    const totalBytes = documents.reduce((sum, document) => sum + document.fileSize, 0)
    if (totalBytes === 0) return '0 KB'

    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.min(Math.floor(Math.log(totalBytes) / Math.log(k)), sizes.length - 1)
    return Math.round((totalBytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }, [documents])

  const lastUploadLabel = useMemo(
    () =>
      documents.length > 0
        ? new Date(documents[0].uploadedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : '-',
    [documents],
  )

  /**
   * Load documents from service with pagination support
   */
  const loadDocuments = useCallback(
    async (page: number = 1) => {
      if (page === 1) {
        setIsLoading(true)
      } else {
        setIsLoadingMore(true)
      }
      setError(null)

      try {
        const docs = await documentClient.getDocuments(familyHeadId, page, DOCS_PER_PAGE)
        if (page === 1) {
          setDocuments(docs)
        } else {
          setDocuments((prev) => [...prev, ...docs])
        }
        setCurrentPage(page)
        // Calculate total pages based on response length
        // If we get fewer docs than DOCS_PER_PAGE, we're on the last page
        const isLastPage = docs.length < DOCS_PER_PAGE
        setTotalPages(isLastPage ? page : page + 1)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load documents'
        setError(errorMessage)
        console.error('Error loading documents:', err)
      } finally {
        if (page === 1) {
          setIsLoading(false)
        } else {
          setIsLoadingMore(false)
        }
      }
    },
    [familyHeadId],
  )

  /**
   * Load documents on mount
   */
  useEffect(() => {
    void loadDocuments(1)
  }, [loadDocuments])

  /**
   * Handle successful upload
   */
  const handleUploadSuccess = useCallback(
    (newDocuments: Document[]) => {
      setDocuments((prev) => [...prev, ...newDocuments])
      setSelectedDocument(null)
      // ZIP is now out of date
      if (zipStatus === 'ready') setZipStatus('stale')
    },
    [zipStatus],
  )

  /**
   * Handle upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage)
  }, [])

  /**
   * Delete document
   */
  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      if (isDeleting) return

      setIsDeleting(true)

      try {
        await documentClient.deleteDocument(documentId)
        setDocuments((prev) => prev.filter((doc) => doc.id !== documentId))
        setSelectedDocument(null)
        // ZIP is now out of date
        if (zipStatus === 'ready') setZipStatus('stale')
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete document'
        setError(errorMessage)
      } finally {
        setIsDeleting(false)
      }
    },
    [isDeleting, zipStatus],
  )

  /**
   * Download document via same-origin streaming route.
   * This avoids client-side dependence on presigned URL signatures.
   */
  const handleDownloadDocument = useCallback(
    async (documentId: string) => {
      const doc = documents.find((d) => d.id === documentId)
      if (!doc) return

      const encodedKey = encodeURIComponent(doc.minio.key)
      const anchor = window.document.createElement('a')
      anchor.href = `/api/documents/download?key=${encodedKey}`
      anchor.download = doc.fileName
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      window.document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    },
    [documents],
  )

  /**
   * Fetch current ZIP status from the server
   */
  const checkZipStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/zip?familyHeadId=${encodeURIComponent(familyHeadId)}`)
      const json = await res.json()
      const { status, minioKey, fileName } = json?.data ?? json
      setZipStatus((status as ZipStatus) || 'none')
      setZipMinioKey(minioKey ?? null)
      setZipCreatedFileName(fileName ?? null)
    } catch {
      setZipStatus('none')
    }
  }, [familyHeadId])

  // Load zip status on mount
  useEffect(() => {
    void checkZipStatus()
  }, [checkZipStatus])

  /**
   * Create ZIP on server, upload to MinIO, then mark as ready
   */
  const handleCreateZip = useCallback(async () => {
    if (zipStatus === 'creating' || documents.length === 0) return
    setZipStatus('creating')
    try {
      const res = await fetch('/api/documents/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyHeadId,
          zipFileName: zipFileName || familyHeadId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create ZIP')
      }
      const { minioKey, fileName } = json?.data ?? json
      setZipMinioKey(minioKey)
      setZipCreatedFileName(fileName)
      setZipStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ZIP')
      setZipStatus('none')
    }
  }, [familyHeadId, zipFileName, documents.length, zipStatus])

  /**
   * Download the pre-generated ZIP from MinIO
   */
  const handleDownloadZip = useCallback(() => {
    if (!zipMinioKey) return
    const anchor = window.document.createElement('a')
    anchor.href = `/api/documents/download?key=${encodeURIComponent(zipMinioKey)}`
    anchor.download = zipCreatedFileName || `${zipFileName || familyHeadId}.zip`
    window.document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }, [zipMinioKey, zipCreatedFileName, zipFileName, familyHeadId])

  /**
   * Dismiss error
   */
  const dismissError = useCallback(() => {
    setError(null)
  }, [])

  return (
    <div className={`flex flex-col gap-4 ${className}`} data-testid="document-hub">
      {/* File Server Status (Optional) */}
      {showStatus && <MinioStatus />}

      {/* Error Alert */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button onClick={dismissError} className="flex-shrink-0 text-red-400 hover:text-red-600">
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Document Management</h1>
          <p className="text-slate-600 text-sm mt-1">
            {customSubtitle || (
              <>
                Manage documents shared by <span className="font-medium">{familyHeadName}</span>{' '}
                family
              </>
            )}
          </p>
        </div>
        {documents.length > 0 && (
          <div className="flex-shrink-0">
            {/* none or stale → offer to create/update */}
            {(zipStatus === 'none' || zipStatus === 'stale' || zipStatus === 'unknown') && (
              <button
                onClick={() => void handleCreateZip()}
                disabled={zipStatus === 'unknown'}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                title={zipStatus === 'stale' ? 'Documents changed – regenerate ZIP' : 'Package all documents into a ZIP file'}
              >
                <Archive className="w-4 h-4" />
                {zipStatus === 'stale' ? 'Update ZIP' : 'Create ZIP to Download'}
              </button>
            )}

            {/* creating → loading spinner */}
            {zipStatus === 'creating' && (
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2 bg-slate-400 text-white text-sm font-medium rounded-lg cursor-not-allowed"
              >
                <Loader className="w-4 h-4 animate-spin" />
                Creating ZIP…
              </button>
            )}

            {/* ready → download + re-create option */}
            {zipStatus === 'ready' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadZip}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                  title="Download the ready-made ZIP archive"
                >
                  <DownloadCloud className="w-4 h-4" />
                  Download ZIP
                </button>
                <button
                  onClick={() => void handleCreateZip()}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                  title="Regenerate ZIP with latest documents"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content (2-column layout on desktop) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Left column: Upload + Documents + Stats */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Upload Sections - Pyramid Structure */}
          <div className="flex-shrink-0 space-y-3">
            {/* Top: Main Documents (Full Width) */}
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <DocumentUpload
                familyHeadId={familyHeadId}
                category="general"
                heading="Main Documents"
                compact={true}
                onSuccess={handleUploadSuccess}
                onError={handleUploadError}
                disabled={isDeleting}
              />
            </div>

            {/* Bottom: Receipts and Application Review (Side by Side) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                <DocumentUpload
                  familyHeadId={familyHeadId}
                  category="receipt"
                  heading="Receipts"
                  compact={true}
                  onSuccess={handleUploadSuccess}
                  onError={handleUploadError}
                  disabled={isDeleting}
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                <DocumentUpload
                  familyHeadId={familyHeadId}
                  category="application-review"
                  heading="Application Review"
                  compact={true}
                  onSuccess={handleUploadSuccess}
                  onError={handleUploadError}
                  disabled={isDeleting}
                />
              </div>
            </div>
          </div>

          {/* Categorized Grid Section - Scrollable */}
          <div className="flex-1 min-h-[240px] overflow-auto">
            <h2 className="text-xl font-semibold text-slate-800 mb-4 sticky top-0 bg-slate-50 py-2 z-10">
              Your Documents
            </h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader className="w-8 h-8 text-slate-400 animate-spin" />
                  <p className="text-slate-600">Loading documents...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {/* Main Documents */}
                {categorizedDocuments.main.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <span className="text-base">📁</span>
                      Main Documents ({categorizedDocuments.main.length})
                    </h3>
                    <DocumentGrid
                      documents={categorizedDocuments.main}
                      isLoading={false}
                      onSelectDocument={setSelectedDocument}
                      onDelete={handleDeleteDocument}
                      onDownload={handleDownloadDocument}
                    />
                  </div>
                )}

                {/* Application Reviews */}
                {categorizedDocuments.review.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <span className="text-base">📋</span>
                      Application Reviews ({categorizedDocuments.review.length})
                    </h3>
                    <DocumentGrid
                      documents={categorizedDocuments.review}
                      isLoading={false}
                      onSelectDocument={setSelectedDocument}
                      onDelete={handleDeleteDocument}
                      onDownload={handleDownloadDocument}
                    />
                  </div>
                )}

                {/* Receipts */}
                {categorizedDocuments.receipt.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <span className="text-base">🧾</span>
                      Receipts ({categorizedDocuments.receipt.length})
                    </h3>
                    <DocumentGrid
                      documents={categorizedDocuments.receipt}
                      isLoading={false}
                      onSelectDocument={setSelectedDocument}
                      onDelete={handleDeleteDocument}
                      onDownload={handleDownloadDocument}
                    />
                  </div>
                )}

                {/* Empty state */}
                {documents.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-lg mb-2">📂</p>
                    <p>No documents yet. Upload files using the sections above.</p>
                  </div>
                )}

                {/* Load More Button */}
                {documents.length > 0 && currentPage < totalPages && (
                  <div className="flex justify-center mt-6 pb-4">
                    <button
                      onClick={() => loadDocuments(currentPage + 1)}
                      disabled={isLoadingMore}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
                    >
                      {isLoadingMore ? 'Loading...' : 'Load More Documents'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 flex-shrink-0">
            <div>
              <p className="text-xs text-slate-600">Total Documents</p>
              <p className="text-lg font-semibold text-slate-800">{documents.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600">Total Size</p>
              <p className="text-lg font-semibold text-slate-800">{totalSizeLabel}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600">Last Upload</p>
              <p className="text-lg font-semibold text-slate-800">{lastUploadLabel}</p>
            </div>
          </div>
        </div>

        {/* Right column: Preview */}
        <div className="min-h-0 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Preview Container</h2>
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-3">
            <DocumentPreview
              document={selectedDocument}
              onClose={() => setSelectedDocument(null)}
              onDelete={handleDeleteDocument}
              onDownload={handleDownloadDocument}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default DocumentHub

'use client'

/**
 * Document Hub Page
 * Main document management interface for family-level document sharing
 * All applicants in the family can access shared documents
 * 
 * @page /dashboard/applications/nadra/documents/[familyHeadId]
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Document } from './types'
import { documentService } from '@/lib/services/documentService'
import { MinioStatus } from './MinioStatus'
import { DocumentUpload } from './DocumentUpload'
import { DocumentGrid } from './DocumentGrid'
import { DocumentPreview } from './DocumentPreview'
import { AlertCircle, Loader } from 'lucide-react'

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
   * Show file server status bar
   */
  showStatus?: boolean

  /**
   * Custom CSS class
   */
  className?: string
}

/**
 * DocumentHub Component
 * Main interface for managing family-level documents
 */
export function DocumentHub({
  familyHeadId,
  familyHeadName = 'Family',
  showStatus = true,
  className = '',
}: DocumentHubProps) {
  // State management
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  /**
   * Load documents on mount
   */
  useEffect(() => {
    loadDocuments()
  }, [familyHeadId])

  /**
   * Load documents from service
   */
  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const docs = await documentService.getDocuments(familyHeadId)
      setDocuments(docs)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents'
      setError(errorMessage)
      console.error('Error loading documents:', err)
    } finally {
      setIsLoading(false)
    }
  }, [familyHeadId])

  /**
   * Handle successful upload
   */
  const handleUploadSuccess = useCallback(
    (newDocuments: Document[]) => {
      setDocuments(prev => [...prev, ...newDocuments])
      // Clear selected document after upload
      setSelectedDocument(null)
    },
    []
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
        await documentService.deleteDocument(documentId)
        setDocuments(prev => prev.filter(doc => doc.id !== documentId))
        setSelectedDocument(null)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete document'
        setError(errorMessage)
      } finally {
        setIsDeleting(false)
      }
    },
    [isDeleting]
  )

  /**
   * Download document
   */
  const handleDownloadDocument = useCallback(async (documentId: string) => {
    try {
      const blob = await documentService.downloadDocument(documentId)
      const doc = documents.find(d => d.id === documentId)

      if (!doc) return

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = doc.fileName
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download document'
      setError(errorMessage)
    }
  }, [documents])

  /**
   * Dismiss error
   */
  const dismissError = useCallback(() => {
    setError(null)
  }, [])

  return (
    <div className={`flex flex-col h-full gap-4 ${className}`}>
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
          <button
            onClick={dismissError}
            className="flex-shrink-0 text-red-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Document Management</h1>
        <p className="text-slate-600 text-sm mt-1">
          Manage documents shared by <span className="font-medium">{familyHeadName}</span> family
        </p>
      </div>

      {/* Main Content (2-column layout on desktop) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Left column: Upload + Grid */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* Categorized Upload Sections */}
          <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
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

            <div className="rounded-lg border border-slate-200 bg-white p-3">
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

          {/* Grid Section */}
          <div className="flex-1 overflow-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Your Documents</h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader className="w-8 h-8 text-slate-400 animate-spin" />
                  <p className="text-slate-600">Loading documents...</p>
                </div>
              </div>
            ) : (
              <DocumentGrid
                documents={documents}
                isLoading={isLoading}
                onSelectDocument={setSelectedDocument}
                onDelete={handleDeleteDocument}
                onDownload={handleDownloadDocument}
              />
            )}
          </div>
        </div>

        {/* Right column: Preview */}
        <div className="lg:col-span-1 min-h-0 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Preview</h2>
          <div className="flex-1 min-h-0">
            <DocumentPreview
              document={selectedDocument}
              onClose={() => setSelectedDocument(null)}
              onDelete={handleDeleteDocument}
              onDownload={handleDownloadDocument}
            />
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 flex-shrink-0">
        <div>
          <p className="text-xs text-slate-600">Total Documents</p>
          <p className="text-lg font-semibold text-slate-800">{documents.length}</p>
        </div>
        <div>
          <p className="text-xs text-slate-600">Total Size</p>
          <p className="text-lg font-semibold text-slate-800">
            {(() => {
              const totalBytes = documents.reduce((sum, doc) => sum + doc.fileSize, 0)
              const k = 1024
              const sizes = ['B', 'KB', 'MB']
              const i = Math.floor(Math.log(totalBytes / 1024) / Math.log(k))
              return (
                Math.round((totalBytes / Math.pow(k, i + 1)) * 100) / 100 + ' ' + sizes[i]
              )
            })()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-600">Last Upload</p>
          <p className="text-lg font-semibold text-slate-800">
            {documents.length > 0
              ? new Date(documents[0].uploadedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              : '-'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default DocumentHub

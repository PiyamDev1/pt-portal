/**
 * Module: app/dashboard/applications/nadra/components/DocumentHub/DocumentPreview.tsx
 * Dashboard module for applications/nadra/components/DocumentHub/DocumentPreview.tsx.
 */

'use client'

/**
 * Document Preview Component
 * Right-side panel showing full document preview
 * Supports images, PDFs, and file downloads
 *
 * @component
 */

import Image from 'next/image'
import React, { useState, useEffect } from 'react'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { Document } from './types'
import {
  X,
  Download,
  Trash2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

export interface DocumentPreviewProps {
  /**
   * Document to preview (null to show empty state)
   */
  document: Document | null

  /**
   * Callback when preview is closed
   */
  onClose?: () => void

  /**
   * Callback when delete is requested
   */
  onDelete?: (documentId: string) => void

  /**
   * Callback when download is requested
   */
  onDownload?: (documentId: string) => void

  /**
   * Custom CSS class
   */
  className?: string
}

/**
 * DocumentPreview Component
 * Shows full preview of selected document with metadata and actions
 */
export function DocumentPreview({
  document,
  onClose = () => {},
  onDelete = () => {},
  onDownload = () => {},
  className = '',
}: DocumentPreviewProps) {
  const [zoom, setZoom] = useState(100)
  const [isLoading, setIsLoading] = useState(true)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Reset zoom when document changes
  useEffect(() => {
    setZoom(100)
  }, [document?.id])

  // Build a stable preview URL that streams bytes from our API.
  useEffect(() => {
    if (!document) {
      setPreviewSrc(null)
      setIsLoading(false)
      return
    }

    let cancelled = false

    const loadPreviewUrl = async () => {
      setIsLoading(true)

      if (!cancelled) {
        setPreviewSrc(`/api/documents/preview?key=${encodeURIComponent(document.minio.key)}`)
      }
    }

    void loadPreviewUrl()

    return () => {
      cancelled = true
    }
  }, [document])

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Determine if document is an image
  const isImage = document?.fileType?.startsWith('image/')
  const isPDF = document?.fileType?.includes('pdf')

  // Empty state
  if (!document) {
    return (
      <div
        className={`flex items-center justify-center h-full text-center text-slate-500 ${className}`}
      >
        <div>
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Select a document to preview</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className={`flex flex-col h-full bg-white rounded-lg border border-slate-200 overflow-hidden ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate text-sm" title={document.fileName}>
              {document.fileName}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {formatFileSize(document.fileSize)} • {formatDate(document.uploadedAt)}
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-50 p-4 relative">
          {isImage ? (
            // Image Preview
              <div className="flex items-center justify-center w-full h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSrc || ''}
                  alt={document.fileName}
                  className="max-w-full max-h-full rounded-md"
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transition: 'transform 0.2s ease-out',
                  }}
                  onLoad={() => setIsLoading(false)}
                  onError={() => setIsLoading(false)}
                />
              </div>
          ) : isPDF ? (
            // PDF Preview
            <div className="w-full h-full min-h-[360px] bg-white rounded-md border border-slate-200 overflow-hidden">
              <iframe
                src={previewSrc || ''}
                title={document.fileName}
                className="w-full h-full"
                onLoad={() => setIsLoading(false)}
              />
            </div>
          ) : (
            // Other file types
            <div className="flex flex-col items-center justify-center text-slate-500">
              <FileText className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-2">Preview Not Available</p>
              <p className="text-sm text-slate-400 mb-4">
                This file type cannot be previewed in the browser
              </p>
              <button
                onClick={() => onDownload(document.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download File
              </button>
            </div>
          )}

          {/* Loading indicator for images */}
          {isImage && isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/50">
              <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Controls Bar (for images) */}
        {isImage && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              disabled={zoom <= 50}
              className="p-2 text-slate-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed rounded-md hover:text-slate-800 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="text-xs font-medium text-slate-600 min-w-12 text-center">{zoom}%</span>

            <button
              onClick={() => setZoom(Math.min(200, zoom + 10))}
              disabled={zoom >= 200}
              className="p-2 text-slate-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed rounded-md hover:text-slate-800 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-px h-6 bg-slate-300 mx-1" />

            <button
              onClick={() => setZoom(100)}
              className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded-md hover:text-slate-800 transition-colors"
            >
              Reset
            </button>
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center gap-2 p-3 border-t border-slate-200 flex-shrink-0 bg-slate-50">
          <button
            onClick={() => onDownload(document.id)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">Download</span>
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-medium">Delete</span>
          </button>
        </div>
      </div>
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          onDelete(document.id)
          setShowDeleteConfirm(false)
        }}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        type="danger"
      />
    </>
  )
}

export default DocumentPreview

/**
 * Module: app/dashboard/applications/nadra/components/DocumentHub/DocumentGrid.tsx
 * Dashboard module for applications/nadra/components/DocumentHub/DocumentGrid.tsx.
 */

'use client'

/**
 * Document Grid Component
 * Displays documents as a responsive grid with thumbnails
 * Shows file metadata and hover actions
 *
 * @component
 */

import Image from 'next/image'
import React, { useEffect, useState } from 'react'
import { Document } from './types'
import { FileText, Trash2, Download, Eye, File } from 'lucide-react'

type PdfJsModule = typeof import('pdfjs-dist')

export interface DocumentGridProps {
  /**
   * List of documents to display
   */
  documents: Document[]

  /**
   * Loading state
   */
  isLoading?: boolean

  /**
   * Callback when document is selected for preview
   */
  onSelectDocument?: (document: Document) => void

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
 * Skeleton loader for grid items
 */
function DocumentSkeleton() {
  return <div className="rounded-lg overflow-hidden bg-slate-200 animate-pulse aspect-square" />
}

function PdfThumbnail({ src, alt }: { src: string; alt: string }) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let isCancelled = false

    const renderFirstPage = async () => {
      try {
        const pdfjs = (await import('pdfjs-dist')) as PdfJsModule

        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        }

        const loadingTask = pdfjs.getDocument(src)
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)

        const baseViewport = page.getViewport({ scale: 1 })
        const targetWidth = 380
        const scale = targetWidth / baseViewport.width
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Canvas rendering context not available')
        }

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)

        await page.render({ canvasContext: context, viewport, canvas }).promise

        if (!isCancelled) {
          setThumbnail(canvas.toDataURL('image/webp', 0.82))
          setFailed(false)
        }

        await pdf.destroy()
      } catch (err) {
        console.error('[PdfThumbnail] render failed:', err)
        if (!isCancelled) {
          setFailed(true)
        }
      }
    }

    void renderFirstPage()

    return () => {
      isCancelled = true
    }
  }, [src])

  if (thumbnail && !failed) {
    return (
      <div className="relative h-full w-full">
        <Image
          src={thumbnail}
          alt={alt}
          fill
          unoptimized
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-4xl bg-slate-100">📄</div>
    )
  }

  return (
    <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center text-xs text-slate-500 px-2 text-center">
      Generating preview...
    </div>
  )
}

/**
 * Individual document grid item
 */
function DocumentGridItem({
  document,
  onSelect,
  onDelete,
  onDownload,
}: {
  document: Document
  onSelect: (doc: Document) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
}) {
  const [showActions, setShowActions] = useState(false)
  const [thumbnailFailed, setThumbnailFailed] = useState(false)

  // Determine if preview image should be shown
  const isImage = document.fileType?.startsWith('image/')
  const isPDF = document.fileType?.includes('pdf')

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
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Get file type icon
  const getFileTypeIcon = () => {
    if (isImage) return '🖼️'
    if (isPDF) return '📄'
    if (document.fileType?.includes('word')) return '📝'
    if (document.fileType?.includes('sheet') || document.fileType?.includes('excel')) return '📊'
    return '📎'
  }

  const getThumbnailSrc = () => {
    const thumbnail = document.preview?.thumbnail

    // Use only fully-qualified URLs (or data URLs) as-is.
    if (
      thumbnail &&
      (thumbnail.startsWith('http://') ||
        thumbnail.startsWith('https://') ||
        thumbnail.startsWith('data:'))
    ) {
      return thumbnail
    }

    // Allow our own API thumbnail/preview endpoints if already present.
    if (
      thumbnail &&
      (thumbnail.startsWith('/api/documents/preview?') ||
        thumbnail.startsWith('/api/documents/download?'))
    ) {
      return thumbnail
    }

    // If thumbnail is actually a raw object key, proxy it through the download route.
    if (thumbnail) {
      return `/api/documents/preview?key=${encodeURIComponent(thumbnail)}`
    }

    // Default to the document object key.
    return `/api/documents/preview?key=${encodeURIComponent(document.minio.key)}`
  }

  return (
    <div
      className="group relative rounded-lg overflow-hidden border border-slate-200 hover:border-blue-300 transition-all duration-200 hover:shadow-md bg-white cursor-pointer"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Thumbnail Container */}
      <div
        className="aspect-square bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center overflow-hidden"
        onClick={() => onSelect(document)}
      >
        {isImage ? (
          // Image preview
          <div className="relative w-full h-full">
            {!thumbnailFailed && (
              <Image
                src={getThumbnailSrc()}
                alt={document.fileName}
                fill
                unoptimized
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                onLoad={() => setThumbnailFailed(false)}
                onError={() => setThumbnailFailed(true)}
              />
            )}
            {/* Fallback icon */}
            {thumbnailFailed && (
              <div className="absolute inset-0 flex items-center justify-center text-4xl bg-slate-100">
                {getFileTypeIcon()}
              </div>
            )}
          </div>
        ) : isPDF ? (
          <PdfThumbnail src={getThumbnailSrc()} alt={document.fileName} />
        ) : (
          // File type icon for non-images
          <div className="text-5xl opacity-50 group-hover:opacity-75 transition-opacity">
            {getFileTypeIcon()}
          </div>
        )}

        {/* Hover overlay with action hint */}
        <div
          className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
            showActions ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Eye className="w-8 h-8 text-white" />
        </div>
      </div>

      {/* File Info */}
      <div className="p-3">
        <h4
          className="text-sm font-medium text-slate-800 truncate hover:text-clip"
          title={document.fileName}
        >
          {document.fileName}
        </h4>

        <div className="mt-1 space-y-0.5 text-xs text-slate-600">
          <p>{formatFileSize(document.fileSize)}</p>
          <p className="text-slate-500">{formatDate(document.uploadedAt)}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className={`absolute top-2 right-2 flex gap-1 transition-opacity ${
          showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDownload(document.id)
          }}
          className="p-2 rounded-md bg-white/90 text-slate-700 hover:bg-white hover:text-blue-600 transition-colors shadow-sm"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(document.id)
          }}
          className="p-2 rounded-md bg-white/90 text-slate-700 hover:bg-white hover:text-red-600 transition-colors shadow-sm"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * DocumentGrid Component
 * Displays a responsive grid of document thumbnails
 */
export function DocumentGrid({
  documents,
  isLoading = false,
  onSelectDocument = () => {},
  onDelete = () => {},
  onDownload = () => {},
  className = '',
}: DocumentGridProps) {
  const itemCount = isLoading ? 6 : documents.length

  // Empty state
  if (!isLoading && documents.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="font-medium text-slate-700 mb-1">No documents yet</h3>
        <p className="text-sm text-slate-500">Upload documents to get started</p>
      </div>
    )
  }

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 ${className}`}
    >
      {isLoading
        ? Array.from({ length: itemCount }).map((_, i) => <DocumentSkeleton key={i} />)
        : documents.map((doc) => (
            <DocumentGridItem
              key={doc.id}
              document={doc}
              onSelect={onSelectDocument}
              onDelete={onDelete}
              onDownload={onDownload}
            />
          ))}
    </div>
  )
}

export default DocumentGrid

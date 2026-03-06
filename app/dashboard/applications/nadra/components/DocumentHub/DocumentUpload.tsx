'use client'

/**
 * Document Upload Component
 * Handles drag-and-drop file upload with validation and progress tracking
 * Supports multiple file selection with real-time progress indicators
 * 
 * @component
 */

import React, { useCallback, useState, useRef } from 'react'
import { Upload, X, AlertCircle, CheckCircle2, File, FileText } from 'lucide-react'
import { documentService } from '@/lib/services/documentService'
import { UploadProgress, Document } from './types'

export interface DocumentUploadProps {
  /**
   * Family Head ID to associate documents with
   * All applicants in the family will have access to these documents
   */
  familyHeadId: string

  /**
   * Callback when documents are successfully uploaded
   */
  onSuccess?: (documents: Document[]) => void

  /**
   * Callback when upload fails
   */
  onError?: (error: string) => void

  /**
   * Whether component is disabled
   */
  disabled?: boolean

  /**
   * Upload category for server-side organization
   */
  category?: 'receipt' | 'application-review' | 'general'

  /**
   * Optional heading for the upload area
   */
  heading?: string

  /**
   * Smaller footprint for sectioned layouts
   */
  compact?: boolean

  /**
   * Custom CSS class
   */
  className?: string
}

/**
 * DocumentUpload Component
 * Provides drag-and-drop and file picker for family-level document uploads
 */
export function DocumentUpload({
  familyHeadId,
  onSuccess,
  onError,
  disabled = false,
  category = 'general',
  heading,
  compact = false,
  className = '',
}: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Document[]>([])

  /**
   * Get file icon based on type
   */
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return '🖼️'
    }
    if (fileType.includes('pdf')) {
      return '📄'
    }
    if (fileType.includes('word')) {
      return '📝'
    }
    if (fileType.includes('sheet') || fileType.includes('excel')) {
      return '📊'
    }
    return '📎'
  }

  /**
   * Validate and upload files
   */
  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files) return

      const fileArray = Array.from(files)
      const newUploads: UploadProgress[] = []

      // Create upload progress entries
      for (const file of fileArray) {
        const fileId = `${Date.now()}-${Math.random()}`
        const validation = documentService.validateFile(file)

        if (!validation.valid) {
          newUploads.push({
            fileId,
            fileName: file.name,
            progress: 0,
            status: 'error',
            error: validation.error,
          })
          if (onError) onError(`${file.name}: ${validation.error}`)
        } else {
          newUploads.push({
            fileId,
            fileName: file.name,
            progress: 0,
            status: 'pending',
            uploadedBytes: 0,
            totalBytes: file.size,
          })
        }
      }

      setUploads(prev => [...prev, ...newUploads])

      // Upload files
      const successfulDocs: Document[] = []

      for (const file of fileArray) {
        const fileId = newUploads.find(u => u.fileName === file.name)?.fileId
        if (!fileId) continue

        try {
          // Update status to uploading
          setUploads(prev =>
            prev.map(u =>
              u.fileId === fileId
                ? { ...u, status: 'uploading', progress: 0 }
                : u
            )
          )

          // Simulate upload progress (in production, would track actual progress)
          const progressInterval = setInterval(() => {
            setUploads(prev =>
              prev.map(u => {
                if (u.fileId === fileId && u.status === 'uploading') {
                  const newProgress = Math.min(u.progress + Math.random() * 30, 95)
                  return { ...u, progress: newProgress }
                }
                return u
              })
            )
          }, 200)

          // Upload document
          const doc = await documentService.uploadDocument(file, familyHeadId, category)

          clearInterval(progressInterval)

          // Update to success
          setUploads(prev =>
            prev.map(u =>
              u.fileId === fileId
                ? { ...u, status: 'success', progress: 100 }
                : u
            )
          )

          successfulDocs.push(doc)

          // Auto remove successful uploads after 2 seconds
          setTimeout(() => {
            setUploads(prev => prev.filter(u => u.fileId !== fileId))
          }, 2000)
        } catch (error) {
          setUploads(prev =>
            prev.map(u =>
              u.fileId === fileId
                ? {
                    ...u,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Upload failed',
                  }
                : u
            )
          )
        }
      }

      if (successfulDocs.length > 0) {
        setUploadedFiles(prev => [...prev, ...successfulDocs])
        if (onSuccess) onSuccess(successfulDocs)
      }

      // Clear input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [familyHeadId, onSuccess, onError]
  )

  /**
   * Handle drag events
   */
  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  /**
   * Handle drop
   */
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      if (disabled) return

      handleFileUpload(e.dataTransfer.files)
    },
    [disabled, handleFileUpload]
  )

  /**
   * Remove upload from list
   */
  const removeUpload = (fileId: string) => {
    setUploads(prev => prev.filter(u => u.fileId !== fileId))
  }

  const sectionText =
    category === 'receipt'
      ? 'Upload receipts and payment records for this family.'
      : category === 'application-review'
        ? 'Upload files needed for application review.'
        : 'Upload supporting documents for this family.'

  return (
    <div className={`space-y-4 ${className}`}>
      {heading && (
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{heading}</h3>
          <p className="text-xs text-slate-600 mt-0.5">{sectionText}</p>
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg transition-all ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-slate-50'
        } ${compact ? 'p-4' : 'p-8'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={e => handleFileUpload(e.target.files)}
          disabled={disabled}
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
        />

        <div className={`flex flex-col items-center text-center ${compact ? 'gap-2' : 'gap-3'}`}>
          <div className="flex gap-4">
            <Upload className={`${compact ? 'w-8 h-8' : 'w-12 h-12'} text-blue-500`} />
          </div>

          <div>
            <h3 className="font-semibold text-slate-800">
              {compact ? 'Drop files here' : 'Drop documents here'}
            </h3>
            <p className={`${compact ? 'text-xs' : 'text-sm'} text-slate-600`}>
              or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="text-blue-600 hover:underline font-medium disabled:opacity-50"
              >
                browse to select files
              </button>
            </p>
          </div>

          <p className="text-xs text-slate-500 mt-2">
            Max file size: 1.5 MB • Supported: PDF, JPG, PNG, WEBP, DOCX, XLSX
          </p>
        </div>
      </div>

      {/* Upload Progress List */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Uploading...</h4>

          {uploads.map(upload => (
            <div
              key={upload.fileId}
              className="flex items-center gap-3 p-3 rounded-lg border bg-white"
            >
              {/* File Icon */}
              <div className="flex-shrink-0">
                {upload.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : upload.status === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <File className="w-5 h-5 text-slate-400" />
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {upload.fileName}
                </p>

                {upload.status === 'uploading' && (
                  <>
                    <div className="mt-1 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {Math.round(upload.progress)}%
                    </p>
                  </>
                )}

                {upload.status === 'error' && (
                  <p className="text-xs text-red-600 mt-0.5">{upload.error}</p>
                )}

                {upload.status === 'success' && (
                  <p className="text-xs text-green-600 mt-0.5">Uploaded successfully</p>
                )}
              </div>

              {/* Remove Button */}
              {(upload.status === 'error' || upload.status === 'success') && (
                <button
                  onClick={() => removeUpload(upload.fileId)}
                  className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recently Uploaded */}
      {uploadedFiles.length > 0 && uploads.length === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-800">
            ✓ {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} uploaded
            successfully
          </p>
        </div>
      )}
    </div>
  )
}

export default DocumentUpload

'use client'

import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import type { TravelPackageDocument } from '@/app/types/packages'
import { groupPackageDocumentsByCategory } from '@/lib/packageDocuments'
import { formatFileSize, isVisaPhotoDocument } from './packageOverviewModel'

type PackageDocumentLibraryPanelProps = {
  documents: TravelPackageDocument[]
  loading: boolean
  updatingDocumentId: string | null
  renamingDocumentId: string | null
  renameName: string
  reservationTitles: ReadonlyMap<string, string>
  visaPhotosByTravelDocumentId: Record<string, TravelPackageDocument[]>
  onRenameNameChange: (name: string) => void
  onSaveRename: (document: TravelPackageDocument) => void | Promise<void>
  onCancelRename: () => void
  onStartRename: (document: TravelPackageDocument) => void
  onLinkPhoto: (document: TravelPackageDocument) => void
  onPreview: (document: TravelPackageDocument) => void | Promise<void>
  onDownload: (document: TravelPackageDocument) => void | Promise<void>
  onUpdateVisibility: (
    document: TravelPackageDocument,
    customerVisible: boolean,
  ) => void | Promise<void>
  onDelete: (document: TravelPackageDocument) => void | Promise<void>
}

export function PackageDocumentLibraryPanel({
  documents,
  loading,
  updatingDocumentId,
  renamingDocumentId,
  renameName,
  reservationTitles,
  visaPhotosByTravelDocumentId,
  onRenameNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onLinkPhoto,
  onPreview,
  onDownload,
  onUpdateVisibility,
  onDelete,
}: PackageDocumentLibraryPanelProps) {
  const documentGroups = groupPackageDocumentsByCategory(documents)

  return (
    <section className="order-5 rounded-xl border border-slate-200 bg-white xl:col-span-2">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">Document library</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Review files by category. Travel document photos are nested under the passport they
            belong to.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          {documents.length} files
        </span>
      </div>
      <div className="space-y-3 p-3">
        {documents.length === 0 && !loading ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
            No package documents uploaded yet.
          </div>
        ) : (
          documentGroups.map((group) => (
            <div key={group.value} className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-black text-slate-950">{group.label}</p>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">
                  {group.documents.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {(group.value === 'travel_documents'
                  ? group.documents.filter((document) => !isVisaPhotoDocument(document))
                  : group.documents
                ).map((document) => {
                  const updatingThisDocument = updatingDocumentId === document.id
                  const renamingThisDocument = renamingDocumentId === document.id
                  const documentIsReleased =
                    document.customer_visible && document.status === 'released'
                  const documentIsAgentOnly = document.category === 'travel_documents'
                  const documentIsVisaPhoto = isVisaPhotoDocument(document)
                  const linkedVisaPhotos = visaPhotosByTravelDocumentId[document.id] || []

                  return (
                    <div
                      key={document.id}
                      className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {renamingThisDocument ? (
                            <div className="w-full min-w-0">
                              <input
                                value={renameName}
                                onChange={(event) => onRenameNameChange(event.target.value)}
                                placeholder="Document name"
                                className="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
                              />
                            </div>
                          ) : (
                            <p className="text-sm font-black text-slate-950">{document.title}</p>
                          )}
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${
                              documentIsAgentOnly
                                ? 'bg-amber-50 text-amber-700'
                                : documentIsReleased
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {documentIsAgentOnly
                              ? 'Agents only'
                              : documentIsReleased
                                ? 'Released'
                                : 'Internal'}
                          </span>
                          {documentIsVisaPhoto && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-black uppercase text-indigo-700">
                              <FileImage className="h-3 w-3" />
                              Visa photo
                            </span>
                          )}
                        </div>
                        <p className="mt-1 break-all text-xs font-bold text-slate-500">
                          {document.file_name} · {formatFileSize(document.file_size)}
                        </p>
                        {document.reservation_id && (
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            Linked to{' '}
                            {reservationTitles.get(document.reservation_id) || 'reservation'}
                          </p>
                        )}
                        {documentIsVisaPhoto &&
                          typeof document.metadata?.linkedTravelDocumentTitle === 'string' && (
                            <p className="mt-1 text-xs font-bold text-indigo-700">
                              Photo for {document.metadata.linkedTravelDocumentTitle}
                            </p>
                          )}
                        {document.public_notes && (
                          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-600">
                            {document.public_notes}
                          </p>
                        )}
                        {document.internal_notes && (
                          <p className="mt-2 whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                            {document.internal_notes}
                          </p>
                        )}
                        {document.category === 'travel_documents' &&
                          !documentIsVisaPhoto &&
                          linkedVisaPhotos.length > 0 && (
                            <div className="mt-3 w-full rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-black uppercase text-indigo-700">
                                  Linked visa photos
                                </p>
                                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-indigo-700">
                                  {linkedVisaPhotos.length}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {linkedVisaPhotos.map((photo) => {
                                  const updatingPhoto = updatingDocumentId === photo.id

                                  return (
                                    <div
                                      key={photo.id}
                                      className="min-w-0 rounded-lg border border-indigo-100 bg-white p-2 shadow-sm"
                                    >
                                      <div className="min-w-0">
                                        <p
                                          className="truncate text-xs font-black text-indigo-950"
                                          title={photo.title}
                                        >
                                          {photo.title}
                                        </p>
                                        <p
                                          className="mt-0.5 truncate text-[11px] font-bold text-indigo-700"
                                          title={photo.file_name}
                                        >
                                          {photo.file_name} · {formatFileSize(photo.file_size)}
                                        </p>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void onPreview(photo)}
                                          disabled={updatingPhoto}
                                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-indigo-100 bg-white px-2 text-[11px] font-black text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300"
                                        >
                                          <FileText className="h-3 w-3" />
                                          Preview
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void onDownload(photo)}
                                          disabled={updatingPhoto}
                                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-indigo-100 bg-white px-2 text-[11px] font-black text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300"
                                        >
                                          {updatingPhoto ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <Download className="h-3 w-3" />
                                          )}
                                          Open
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void onDelete(photo)}
                                          disabled={updatingPhoto}
                                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-rose-100 bg-white px-2 text-[11px] font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {renamingThisDocument ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void onSaveRename(document)}
                              disabled={updatingThisDocument}
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              {updatingThisDocument ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={onCancelRename}
                              disabled={updatingThisDocument}
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onStartRename(document)}
                            disabled={updatingThisDocument}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                          >
                            <Pencil className="h-4 w-4" />
                            Rename
                          </button>
                        )}
                        {document.category === 'travel_documents' && !documentIsVisaPhoto && (
                          <button
                            type="button"
                            onClick={() => onLinkPhoto(document)}
                            disabled={updatingThisDocument}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                          >
                            <FileImage className="h-4 w-4" />
                            Link photo
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void onPreview(document)}
                          disabled={updatingThisDocument}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          <FileText className="h-4 w-4" />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDownload(document)}
                          disabled={updatingThisDocument}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          {updatingThisDocument ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!documentIsAgentOnly) {
                              void onUpdateVisibility(document, !documentIsReleased)
                            }
                          }}
                          disabled={updatingThisDocument || documentIsAgentOnly}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          {documentIsReleased ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          {documentIsReleased ? 'Hide' : 'Release'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(document)}
                          disabled={updatingThisDocument}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

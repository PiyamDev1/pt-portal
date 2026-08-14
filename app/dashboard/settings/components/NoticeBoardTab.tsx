/**
 * Notice board administration tab.
 *
 * Admins can publish multiple ordered slides for the desktop dashboard rail and the
 * mobile first-visit notice popup. Images are referenced by URL so this works with
 * Supabase Storage, MinIO, or any approved public asset host.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, ImageIcon, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

type NoticeSlide = {
  id: string
  title: string | null
  body: string | null
  image_url: string | null
  image_storage_provider: string | null
  image_storage_bucket: string | null
  image_storage_key: string | null
  hyperlink_url: string | null
  display_seconds: number
  sort_order: number
  is_active: boolean
  target_role: string | null
  target_department_id: string | null
  target_location_id: string | null
  seen_count?: number
  dismissed_count?: number
  created_at: string
  updated_at: string
}

type SlideForm = {
  id?: string
  title: string
  body: string
  image_url: string
  image_storage_provider: string
  image_storage_bucket: string
  image_storage_key: string
  hyperlink_url: string
  display_seconds: number
  sort_order: number
  is_active: boolean
  target_role: string
  target_department_id: string
  target_location_id: string
}

type NoticeBoardTabProps = {
  roles: { id: string; name: string }[]
  departments: { id: string; name: string }[]
  locations: { id: string; name: string }[]
}

type NoticeBoardApiPayload = {
  error?: unknown
  slides?: NoticeSlide[]
  imageUrl?: string
  image_storage_provider?: string
  image_storage_bucket?: string
  image_storage_key?: string
}

const EMPTY_FORM: SlideForm = {
  title: '',
  body: '',
  image_url: '',
  image_storage_provider: '',
  image_storage_bucket: '',
  image_storage_key: '',
  hyperlink_url: '',
  display_seconds: 6,
  sort_order: 0,
  is_active: true,
  target_role: '',
  target_department_id: '',
  target_location_id: '',
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

function hasNoticeContent(form: SlideForm) {
  return Boolean(form.title.trim() || form.body.trim() || form.image_url.trim())
}

function responseError(response: Response, payload: NoticeBoardApiPayload, fallback: string) {
  const message = typeof payload.error === 'string' ? payload.error : fallback
  const requestId = response.headers.get('x-request-id')
  return new Error(requestId ? `${message} (reference ${requestId})` : message)
}

function toForm(slide: NoticeSlide): SlideForm {
  return {
    id: slide.id,
    title: slide.title || '',
    body: slide.body || '',
    image_url: slide.image_url || '',
    image_storage_provider: slide.image_storage_provider || '',
    image_storage_bucket: slide.image_storage_bucket || '',
    image_storage_key: slide.image_storage_key || '',
    hyperlink_url: slide.hyperlink_url || '',
    display_seconds: slide.display_seconds || 6,
    sort_order: slide.sort_order || 0,
    is_active: slide.is_active !== false,
    target_role: slide.target_role || '',
    target_department_id: slide.target_department_id || '',
    target_location_id: slide.target_location_id || '',
  }
}

export function NoticeBoardTab({ roles, departments, locations }: NoticeBoardTabProps) {
  const [slides, setSlides] = useState<NoticeSlide[]>([])
  const [form, setForm] = useState<SlideForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  function clearLocalPreview() {
    setLocalPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }

  function resetEditor() {
    clearLocalPreview()
    if (fileInputRef.current) fileInputRef.current.value = ''
    setForm(EMPTY_FORM)
    setDeleteId(null)
  }

  function startEditing(slide: NoticeSlide) {
    clearLocalPreview()
    setForm(toForm(slide))
    setDeleteId(null)
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
    }
  }, [localPreviewUrl])

  async function loadSlides() {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/admin/notice-board')
      const payload = (await response.json().catch(() => ({}))) as NoticeBoardApiPayload
      if (!response.ok) throw responseError(response, payload, 'Failed to load notices')
      setSlides(payload.slides || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load notices'
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSlides()
  }, [])

  async function saveSlide() {
    if (uploading) {
      toast.error('Wait for the image upload to finish before saving.')
      return
    }
    if (!hasNoticeContent(form)) {
      toast.error('Add a title, message, or image before saving the notice.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/notice-board', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = (await response.json().catch(() => ({}))) as NoticeBoardApiPayload
      if (!response.ok) throw responseError(response, payload, 'Failed to save notice')
      toast.success(form.id ? 'Notice updated' : 'Notice added')
      resetEditor()
      await loadSlides()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save notice')
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file: File | null) {
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (
      !ALLOWED_IMAGE_EXTENSIONS.has(extension) ||
      (file.type && !ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase()))
    ) {
      toast.error('Choose a JPEG, PNG, or WebP image.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Choose an image that is 5 MB or smaller.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    clearLocalPreview()
    setLocalPreviewUrl(URL.createObjectURL(file))
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/admin/notice-board/upload', {
        method: 'POST',
        body: formData,
      })
      const payload = (await response.json().catch(() => ({}))) as NoticeBoardApiPayload
      if (!response.ok) throw responseError(response, payload, 'Failed to upload image')

      setForm((current) => ({
        ...current,
        image_url: payload.imageUrl || '',
        image_storage_provider: payload.image_storage_provider || '',
        image_storage_bucket: payload.image_storage_bucket || '',
        image_storage_key: payload.image_storage_key || '',
      }))
      toast.success('Image uploaded', { description: 'Save the slide to publish it.' })
    } catch (err) {
      clearLocalPreview()
      toast.error(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteSlide(id: string) {
    try {
      const response = await fetch('/api/admin/notice-board', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const payload = (await response.json().catch(() => ({}))) as NoticeBoardApiPayload
      if (!response.ok) throw responseError(response, payload, 'Failed to delete notice')
      toast.success('Notice deleted')
      setDeleteId(null)
      if (form.id === id) resetEditor()
      await loadSlides()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete notice')
    }
  }

  return (
    <div className="space-y-6">
      <div
        ref={editorRef}
        className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Notice Board</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add dashboard announcements, image slides, and links for staff.
            </p>
          </div>
          <button
            type="button"
            onClick={resetEditor}
            disabled={saving || uploading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4b0f16] px-4 py-2.5 text-sm font-black text-white hover:bg-[#8b1e2d] disabled:opacity-60 sm:w-auto sm:py-2"
          >
            <Plus className="h-4 w-4" />
            New slide
          </button>
        </div>

        {loadError && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {loadError}{' '}
            <button type="button" onClick={() => void loadSlides()} className="underline">
              Retry
            </button>
          </p>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">
            Title
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Important update"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            Image
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(event) => void uploadImage(event.target.files?.[0] || null)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              disabled={uploading}
            />
            <span className="mt-2 block text-xs font-medium text-slate-500">
              JPEG, PNG, or WebP. Maximum 5 MB.
            </span>
            {uploading && (
              <span className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading image
              </span>
            )}
          </label>

          {(localPreviewUrl || form.image_url) && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 lg:col-span-2">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-xs font-black text-slate-600">
                  <ImageIcon className="h-4 w-4 text-[#8b1e2d]" /> Image preview
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearLocalPreview()
                    setForm((current) => ({
                      ...current,
                      image_url: '',
                      image_storage_provider: '',
                      image_storage_bucket: '',
                      image_storage_key: '',
                    }))
                  }}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
              {/* The local object URL previews an upload before its slide record exists. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={localPreviewUrl || form.image_url}
                alt="Notice image preview"
                className="max-h-72 w-full object-contain"
              />
            </div>
          )}

          <label className="block text-sm font-bold text-slate-700">
            Image URL / stored path
            <input
              value={form.image_url}
              onChange={(event) =>
                setForm((current) => ({ ...current, image_url: event.target.value }))
              }
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </label>

          <label className="block text-sm font-bold text-slate-700 lg:col-span-2">
            Text
            <textarea
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Add a short message for staff"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            Hyperlink
            <input
              value={form.hyperlink_url}
              onChange={(event) =>
                setForm((current) => ({ ...current, hyperlink_url: event.target.value }))
              }
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </label>

          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-3">
            <label className="block text-sm font-bold text-slate-700">
              Target role
              <select
                value={form.target_role}
                onChange={(event) =>
                  setForm((current) => ({ ...current, target_role: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold text-slate-700">
              Target department
              <select
                value={form.target_department_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, target_department_id: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold text-slate-700">
              Target branch
              <select
                value={form.target_location_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, target_location_id: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All branches</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold text-slate-700">
              Seconds shown
              <input
                type="number"
                min={2}
                max={60}
                value={form.display_seconds}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    display_seconds: Number(event.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Sort order
              <input
                type="number"
                value={form.sort_order}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sort_order: Number(event.target.value) }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) =>
                setForm((current) => ({ ...current, is_active: event.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-[#8b1e2d]"
            />
            Show this notice to staff
          </label>

          <div className="flex items-end justify-end gap-2">
            {form.id && (
              <button
                type="button"
                onClick={resetEditor}
                disabled={saving || uploading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel edit
              </button>
            )}
            <button
              type="button"
              onClick={() => void saveSlide()}
              disabled={saving || uploading || !hasNoticeContent(form)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-4 py-2 text-sm font-black text-white hover:bg-[#4b0f16] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {form.id ? 'Save changes' : 'Add slide'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-base font-black text-slate-950">Current slides</h3>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notices
          </div>
        ) : slides.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            No notice slides yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {slides.map((slide) => (
              <div key={slide.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-black text-slate-950">
                        {slide.title || 'Untitled notice'}
                      </h4>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">
                        Order {slide.sort_order}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                          slide.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {slide.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </div>
                    {slide.body && (
                      <p className="mt-2 text-sm leading-6 text-slate-600">{slide.body}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{slide.display_seconds}s</span>
                      <span>{slide.seen_count || 0} seen</span>
                      <span>{slide.dismissed_count || 0} dismissed</span>
                      {slide.image_url && <span>Image attached</span>}
                      {slide.target_role && <span>Role: {slide.target_role}</span>}
                      {slide.target_department_id && <span>Department targeted</span>}
                      {slide.target_location_id && <span>Branch targeted</span>}
                      {slide.hyperlink_url && (
                        <a
                          href={slide.hyperlink_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#8b1e2d]"
                        >
                          Link <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(slide)}
                      disabled={saving || uploading}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    {deleteId === slide.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setDeleteId(null)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSlide(slide.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Confirm
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteId(slide.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

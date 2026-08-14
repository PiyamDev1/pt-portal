/**
 * Notice board carousel.
 *
 * Admins manage slides in Settings. Desktop users see the board in the dashboard rail;
 * mobile users get a single first-visit popup for urgent notices without crowding the shell.
 */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ExternalLink, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

type NoticeSlide = {
  id: string
  title: string | null
  body: string | null
  image_url: string | null
  hyperlink_url: string | null
  display_seconds: number
  sort_order: number
}

export function NoticeBoardClient({
  showDesktopRail = true,
  showMobilePopup = true,
}: {
  showDesktopRail?: boolean
  showMobilePopup?: boolean
}) {
  const [slides, setSlides] = useState<NoticeSlide[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [showMobileNotice, setShowMobileNotice] = useState(false)
  const [viewAllMobile, setViewAllMobile] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())
  const mobileDialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/dashboard/notice-board', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((payload: { slides?: NoticeSlide[] }) => {
        if (cancelled) return
        const nextSlides = payload.slides || []
        setSlides(nextSlides)

        if (showMobilePopup && nextSlides.length > 0 && typeof window !== 'undefined') {
          const seen = window.sessionStorage.getItem('ims-notice-board-seen')
          const mobile = document.documentElement.dataset.deviceLayout === 'mobile'
          if (mobile && !seen) setShowMobileNotice(true)
        }
      })
      .catch(() => {
        // The dashboard remains usable without notices.
      })

    return () => {
      cancelled = true
    }
  }, [showMobilePopup])

  const activeSlide = slides[activeIndex]
  const activeDuration = Math.max(Number(activeSlide?.display_seconds || 6), 2) * 1000

  useEffect(() => {
    if (slides.length <= 1) return undefined
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % slides.length)
    }, activeDuration)
    return () => window.clearTimeout(timer)
  }, [activeDuration, slides.length, activeIndex])

  const hasContent = slides.length > 0
  const slide = useMemo(() => activeSlide || null, [activeSlide])

  useEffect(() => {
    if (!slide?.id) return undefined
    const timer = window.setTimeout(() => {
      void fetch('/api/dashboard/notice-board/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideId: slide.id, action: 'seen' }),
        keepalive: true,
      }).catch(() => {})
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [slide?.id])

  function closeMobileNotice() {
    window.sessionStorage.setItem('ims-notice-board-seen', '1')
    setShowMobileNotice(false)
  }

  async function dismissToday() {
    setDismissing(true)
    try {
      const responses = await Promise.all(
        slides.map((item) =>
          fetch('/api/dashboard/notice-board/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slideId: item.id, action: 'dismissed' }),
            keepalive: true,
          }),
        ),
      )
      if (responses.some((response) => !response.ok)) {
        throw new Error('Some notices could not be dismissed')
      }
      closeMobileNotice()
      toast.success('Notices hidden for today')
    } catch {
      toast.error('Unable to hide notices for today. Please try again.')
    } finally {
      setDismissing(false)
    }
  }

  useEffect(() => {
    if (!showMobileNotice || !slide) return undefined

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = mobileDialogRef.current
      if (!dialog) return

      if (event.key === 'Escape' && !dismissing) {
        event.preventDefault()
        closeMobileNotice()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [showMobileNotice, slide, dismissing])

  function markImageFailed(slideId: string) {
    setFailedImages((current) => new Set(current).add(slideId))
  }

  const slideContent = slide ? (
    <>
      {slide.image_url && !failedImages.has(slide.id) && (
        <div className="relative mb-4 h-44 overflow-hidden rounded-2xl bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image_url}
            alt={slide.title || 'Notice board image'}
            className="h-full w-full object-cover"
            onError={() => markImageFailed(slide.id)}
          />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#4b0f16] text-white">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-950">{slide.title || 'Notice'}</h3>
          {slide.body && <p className="mt-2 text-sm leading-6 text-slate-600">{slide.body}</p>}
          {slide.hyperlink_url && (
            <a
              href={slide.hyperlink_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-black text-[#8b1e2d] hover:bg-red-100"
            >
              Open link
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </>
  ) : null

  return (
    <>
      {showDesktopRail && (
        <aside className="platform-desktop-only rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">Notice board</h2>
              <p className="text-xs text-slate-500">Branch updates and announcements.</p>
            </div>
            {hasContent && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                {activeIndex + 1}/{slides.length}
              </span>
            )}
          </div>

          {hasContent ? (
            <div className="min-h-[21rem]">{slideContent}</div>
          ) : (
            <div className="flex min-h-[18rem] items-center justify-center rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              No active notices yet. Admins can add them from Settings.
            </div>
          )}

          {slides.length > 1 && (
            <div className="mt-4 flex gap-2">
              {slides.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-2 flex-1 rounded-full ${index === activeIndex ? 'bg-[#8b1e2d]' : 'bg-slate-200'}`}
                  aria-label={`Show notice ${index + 1}`}
                />
              ))}
            </div>
          )}
        </aside>
      )}

      {showMobileNotice && slide && (
        <div
          className="platform-mobile-flex fixed inset-0 z-50 items-end bg-slate-950/45 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !dismissing) closeMobileNotice()
          }}
        >
          <div
            ref={mobileDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-notice-title"
            aria-busy={dismissing || undefined}
            tabIndex={-1}
            className="w-full rounded-[1.5rem] bg-white p-4 shadow-2xl outline-none"
          >
            <div className="mb-3 flex items-center justify-between">
              <p
                id="mobile-notice-title"
                className="text-xs font-black uppercase tracking-[0.18em] text-[#8b1e2d]"
              >
                Notice
              </p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMobileNotice}
                disabled={dismissing}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-60"
                aria-label="Close notice"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {viewAllMobile ? (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {slides.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-3">
                    <h3 className="text-sm font-black text-slate-950">{item.title || 'Notice'}</h3>
                    {item.body && (
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                    )}
                    {item.hyperlink_url && (
                      <a
                        href={item.hyperlink_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs font-black text-[#8b1e2d]"
                      >
                        Open link <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              slideContent
            )}
            <div className={`mt-4 grid gap-2 ${slides.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {slides.length > 1 && (
                <button
                  type="button"
                  onClick={() => setViewAllMobile((current) => !current)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
                >
                  {viewAllMobile ? 'View featured' : 'View all notices'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void dismissToday()}
                disabled={dismissing}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#4b0f16] px-3 py-2 text-xs font-black text-white disabled:opacity-60"
              >
                {dismissing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-label="Dismissing notices" />
                ) : (
                  <>Don&apos;t show today</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

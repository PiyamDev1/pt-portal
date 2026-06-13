/**
 * Notice board carousel.
 *
 * Admins manage slides in Settings. Desktop users see the board in the dashboard rail;
 * mobile users get a single first-visit popup for urgent notices without crowding the shell.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, ExternalLink, X } from 'lucide-react'

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

  useEffect(() => {
    let cancelled = false

    fetch('/api/dashboard/notice-board')
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((payload: { slides?: NoticeSlide[] }) => {
        if (cancelled) return
        const nextSlides = payload.slides || []
        setSlides(nextSlides)

        if (showMobilePopup && nextSlides.length > 0 && typeof window !== 'undefined') {
          const seen = window.sessionStorage.getItem('ims-notice-board-seen')
          const mobile = window.matchMedia('(max-width: 1023px)').matches
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
    await Promise.all(
      slides.map((item) =>
        fetch('/api/dashboard/notice-board/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slideId: item.id, action: 'dismissed' }),
          keepalive: true,
        }).catch(() => undefined),
      ),
    )
    closeMobileNotice()
  }

  const slideContent = slide ? (
    <>
      {slide.image_url && (
        <div className="relative mb-4 h-44 overflow-hidden rounded-2xl bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image_url}
            alt={slide.title || 'Notice board image'}
            className="h-full w-full object-cover"
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
        <aside className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
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
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-4 backdrop-blur-sm lg:hidden">
          <div className="w-full rounded-[1.5rem] bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8b1e2d]">
                Notice
              </p>
              <button
                type="button"
                onClick={closeMobileNotice}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
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
            <div className="mt-4 grid grid-cols-2 gap-2">
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
                className="rounded-xl bg-[#4b0f16] px-3 py-2 text-xs font-black text-white"
              >
                Don&apos;t show today
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

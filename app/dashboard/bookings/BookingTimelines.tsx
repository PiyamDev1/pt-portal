'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookingStatus } from '@/app/types/bookings'
import {
  DAY_LABELS,
  STATUS_ACCESSIBILITY,
  WEEK_BLOCK_COLORS,
  formatDateLabel,
  formatTime,
  isSameUTCDay,
  timeHHMMToMins,
  type BookingWithService,
  type SlotOption,
} from './bookingClientModel'

export function WeekTimeline({
  weekDays,
  activeBookings,
  conflictBookings,
  today,
  loading,
  mobileDayIndex,
  onSlotClick,
  onBookingClick,
  onReschedule,
  onStatusChange,
}: {
  weekDays: Date[]
  activeBookings: BookingWithService[]
  conflictBookings: BookingWithService[]
  today: Date
  loading: boolean
  mobileDayIndex: number
  onSlotClick: (dateKey: string, startIso: string) => void
  onBookingClick: (booking: BookingWithService) => void
  onReschedule: (id: string, newStartIso: string) => void
  onStatusChange: (id: string, status: string) => void
}) {
  const TIMELINE_START = TIMELINE_START_HOUR * 60
  const TIMELINE_END = TIMELINE_END_HOUR * 60
  const totalHeight = (TIMELINE_END - TIMELINE_START) * TIMELINE_PX_PER_MIN
  const containerRef = useRef<HTMLDivElement>(null)
  const lastAutoScrollWeekRef = useRef<string | null>(null)
  const LABEL_W = 48

  const hours: number[] = []
  for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) hours.push(h)
  const yFor = useCallback(
    (mins: number) => (mins - TIMELINE_START) * TIMELINE_PX_PER_MIN,
    [TIMELINE_START],
  )
  const [currentUtcMinutes, setCurrentUtcMinutes] = useState(() => {
    const now = new Date()
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  })

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      setCurrentUtcMinutes(now.getUTCHours() * 60 + now.getUTCMinutes())
    }, 60000)
    return () => clearInterval(id)
  }, [])

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, BookingWithService[]>()
    for (const b of activeBookings) {
      const dateKey = new Date(b.start_time).toISOString().slice(0, 10)
      const arr = map.get(dateKey) ?? []
      arr.push(b)
      map.set(dateKey, arr)
    }
    return map
  }, [activeBookings])

  const conflictBookingsByDate = useMemo(() => {
    const map = new Map<string, BookingWithService[]>()
    for (const b of conflictBookings) {
      const dateKey = new Date(b.start_time).toISOString().slice(0, 10)
      const arr = map.get(dateKey) ?? []
      arr.push(b)
      map.set(dateKey, arr)
    }
    return map
  }, [conflictBookings])

  useEffect(() => {
    if (!containerRef.current) return
    const weekKey = `${weekDays[0]?.toISOString() ?? ''}|${weekDays[6]?.toISOString() ?? ''}`
    if (lastAutoScrollWeekRef.current === weekKey) return
    lastAutoScrollWeekRef.current = weekKey

    const includesToday = weekDays.some((day) => isSameUTCDay(day, today))
    if (!includesToday) {
      containerRef.current.scrollTop = 0
      return
    }

    const now = new Date()
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
    const target = Math.max(TIMELINE_START, Math.min(TIMELINE_END, currentMinutes))
    containerRef.current.scrollTop = Math.max(0, yFor(target) - 160)
  }, [TIMELINE_END, TIMELINE_START, today, weekDays, yFor])

  // ── Drag-to-reschedule ────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    booking: BookingWithService
    durMin: number
    blockOffsetY: number
  } | null>(null)
  const [dragOver, setDragOver] = useState<{ colIdx: number; startMin: number } | null>(null)
  const dragMovedRef = useRef(false)

  const handleDragStart = useCallback(
    (e: React.MouseEvent, b: BookingWithService, dayStartMs: number) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const startMs = new Date(b.start_time).getTime()
      const durMin = Math.max((new Date(b.end_time).getTime() - startMs) / 60000, 5)
      const startMin = (startMs - dayStartMs) / 60000
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const scrollTop = containerRef.current?.scrollTop ?? 0
      const clickedY = e.clientY - rect.top + scrollTop
      const blockTop = (startMin - TIMELINE_START_HOUR * 60) * TIMELINE_PX_PER_MIN
      const blockOffsetY = Math.max(0, clickedY - blockTop)
      dragMovedRef.current = false
      setDragging({ booking: b, durMin, blockOffsetY })
    },
    [],
  )

  const handleDragMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragging || !containerRef.current) return
      dragMovedRef.current = true
      const rect = containerRef.current.getBoundingClientRect()
      const scrollTop = containerRef.current.scrollTop
      const y = e.clientY - rect.top + scrollTop - dragging.blockOffsetY
      const rawMin = TIMELINE_START_HOUR * 60 + y / TIMELINE_PX_PER_MIN
      const snapped = Math.round(rawMin / 5) * 5
      const clamped = Math.max(
        TIMELINE_START_HOUR * 60,
        Math.min(TIMELINE_END_HOUR * 60 - dragging.durMin, snapped),
      )
      const bodyX = e.clientX - rect.left - LABEL_W
      const colWidth = (rect.width - LABEL_W) / weekDays.length
      const colIdx = Math.max(0, Math.min(weekDays.length - 1, Math.floor(bodyX / colWidth)))
      setDragOver({ colIdx, startMin: clamped })
    },
    [dragging, weekDays.length],
  )

  const handleDragEnd = useCallback(() => {
    const moved = dragMovedRef.current
    if (!dragging || !dragOver || !moved) {
      setDragging(null)
      setDragOver(null)
      return
    }
    const newDate = weekDays[dragOver.colIdx]
    const isPast = newDate.getTime() < today.getTime() && !isSameUTCDay(newDate, today)
    if (!isPast) {
      const newStartIso = new Date(newDate.getTime() + dragOver.startMin * 60000).toISOString()
      if (newStartIso !== dragging.booking.start_time) {
        onReschedule(dragging.booking.id, newStartIso)
      }
    }
    setDragging(null)
    setDragOver(null)
  }, [dragging, dragOver, weekDays, today, onReschedule])

  const dragConflict = useMemo(() => {
    if (!dragging || !dragOver) return false
    const targetDay = weekDays[dragOver.colIdx]
    if (!targetDay) return false
    const targetDateKey = targetDay.toISOString().slice(0, 10)
    const targetBookings = conflictBookingsByDate.get(targetDateKey) ?? []
    const dragStartMs = targetDay.getTime() + dragOver.startMin * 60000
    const dragEndMs = dragStartMs + dragging.durMin * 60000

    return targetBookings.some((booking) => {
      if (booking.id === dragging.booking.id) return false
      const bookingStartMs = new Date(booking.start_time).getTime()
      const bookingEndMs = new Date(booking.end_time).getTime()
      return dragStartMs < bookingEndMs && dragEndMs > bookingStartMs
    })
  }, [conflictBookingsByDate, dragOver, dragging, weekDays])

  // ── Right-click status context menu ──────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    booking: BookingWithService
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const statusActions = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.CANCELLED]
  const mobileDay = weekDays[mobileDayIndex] ?? weekDays[0]
  const mobileDateKey = mobileDay?.toISOString().slice(0, 10) ?? ''
  const mobileBookings = mobileDateKey ? (bookingsByDate.get(mobileDateKey) ?? []) : []
  const hasCurrentTimeInRange =
    currentUtcMinutes >= TIMELINE_START && currentUtcMinutes <= TIMELINE_END
  const currentLineTop = yFor(Math.max(TIMELINE_START, Math.min(TIMELINE_END, currentUtcMinutes)))
  const scrollToNow = useCallback(() => {
    if (!containerRef.current) return
    const now = new Date()
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
    const target = Math.max(TIMELINE_START, Math.min(TIMELINE_END, mins))
    containerRef.current.scrollTop = Math.max(0, yFor(target) - 160)
  }, [TIMELINE_END, TIMELINE_START, yFor])

  return (
    <>
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] select-none md:hidden">
        {mobileDay && (
          <>
            <div className="border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#eef2ff_100%)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {DAY_LABELS[mobileDay.getUTCDay()]}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xl font-bold text-slate-800">{formatDateLabel(mobileDay)}</p>
                    {isSameUTCDay(mobileDay, today) && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        Today
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={scrollToNow}
                  className="ui-tap ui-focus rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back to now
                </button>
              </div>
            </div>

            <div
              ref={containerRef}
              className={`overflow-y-scroll overflow-x-hidden bg-[linear-gradient(180deg,_rgba(248,250,252,0.75)_0%,_rgba(255,255,255,1)_18%)] ${dragging ? 'cursor-grabbing' : ''}`}
              style={{ height: 560 }}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
            >
              <div className="flex" style={{ height: totalHeight }}>
                <div
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className="relative flex-shrink-0"
                >
                  {hours.map((h) => (
                    <div
                      key={`mobile-${h}`}
                      className="absolute right-2 text-[10px] font-medium text-slate-400 text-right leading-none"
                      style={{ top: yFor(h * 60) - 5 }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {loading ? (
                  <div className="relative flex-1 border-l border-slate-200 bg-white/90">
                    {hours.map((h) => (
                      <div
                        key={`mh-${h}`}
                        className="absolute left-0 right-0 border-t border-slate-100"
                        style={{ top: yFor(h * 60) }}
                      />
                    ))}
                    {[0.15, 0.42, 0.7].map((frac, index) => (
                      <div
                        key={index}
                        className="absolute left-0.5 right-0.5 rounded bg-slate-200 animate-pulse"
                        style={{ top: totalHeight * frac, height: 36 + index * 18 }}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className={`relative flex-1 border-l border-slate-200 ${isSameUTCDay(mobileDay, today) ? 'bg-indigo-50/30' : 'bg-white'} ${dragging ? 'cursor-default' : 'cursor-pointer hover:bg-indigo-50/20'}`}
                    onClick={(e) => {
                      if (dragMovedRef.current) {
                        dragMovedRef.current = false
                        return
                      }
                      const rect = e.currentTarget.getBoundingClientRect()
                      const clickedY = e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0)
                      const clickedMin = TIMELINE_START + clickedY / TIMELINE_PX_PER_MIN
                      const roundedMin = Math.round(clickedMin / 5) * 5
                      const clampedMin = Math.max(
                        TIMELINE_START,
                        Math.min(TIMELINE_END - 30, roundedMin),
                      )
                      const startIso = new Date(
                        mobileDay.getTime() + clampedMin * 60000,
                      ).toISOString()
                      onSlotClick(mobileDateKey, startIso)
                    }}
                  >
                    {hours.map((h) => (
                      <div
                        key={`mg-${h}`}
                        className="absolute left-0 right-0 border-t border-slate-100"
                        style={{ top: yFor(h * 60) }}
                      />
                    ))}
                    {hours.map((h) => (
                      <div
                        key={`mgh-${h}`}
                        className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                        style={{ top: yFor(h * 60 + 30) }}
                      />
                    ))}

                    {isSameUTCDay(mobileDay, today) && hasCurrentTimeInRange && (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{ top: currentLineTop }}
                      >
                        <div className="h-0 border-t-2 border-rose-500" />
                        <span className="absolute right-1 -top-3 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-semibold text-white animate-pulse">
                          Now
                        </span>
                      </div>
                    )}

                    {mobileBookings.map((b) => {
                      const startMs = new Date(b.start_time).getTime()
                      const endMs = new Date(b.end_time).getTime()
                      const startMin = (startMs - mobileDay.getTime()) / 60000
                      const durMin = Math.max((endMs - startMs) / 60000, 5)
                      const top = yFor(startMin)
                      const height = Math.max(durMin * TIMELINE_PX_PER_MIN, 22)
                      const colors = WEEK_BLOCK_COLORS[b.status] ?? WEEK_BLOCK_COLORS.pending
                      const isPending = b.status === BookingStatus.PENDING
                      return (
                        <div
                          key={`mobile-booking-${b.id}`}
                          className={`absolute left-1 right-1 rounded-xl px-2 py-1 overflow-hidden shadow-sm ring-1 ring-black/5 ${colors.bg} ${colors.hover}`}
                          style={{ top, height }}
                          onClick={(e) => {
                            e.stopPropagation()
                            onBookingClick(b)
                          }}
                        >
                          <p
                            className={`text-[10px] font-bold truncate ${isPending ? 'text-slate-900' : 'text-white'}`}
                          >
                            {formatTime(b.start_time)} · {b.customer_name}
                          </p>
                          {height >= 42 && (
                            <p
                              className={`text-[9px] truncate ${isPending ? 'text-slate-700' : 'text-white/80'}`}
                            >
                              {b.booking_services?.name || 'Service'}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] select-none md:block">
        {/* Day header row */}
        <div className="flex border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#eef2ff_100%)]">
          <div style={{ width: LABEL_W, minWidth: LABEL_W }} />
          {weekDays.map((day) => {
            const isToday = isSameUTCDay(day, today)
            const isPast = day.getTime() < today.getTime() && !isToday
            const count = bookingsByDate.get(day.toISOString().slice(0, 10))?.length ?? 0
            return (
              <div
                key={day.toISOString()}
                className={`flex-1 text-center py-2 border-l border-slate-200 ${isToday ? 'bg-indigo-50' : ''}`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-indigo-500' : isPast ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  {DAY_LABELS[day.getUTCDay()]}
                </p>
                <p
                  className={`text-xl font-bold leading-tight ${isToday ? 'text-indigo-600' : isPast ? 'text-slate-400' : 'text-slate-700'}`}
                >
                  {day.getUTCDate()}
                </p>
                {count > 0 && (
                  <span
                    className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${isToday ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}
                  >
                    {count}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Scrollable body */}
        <div
          ref={containerRef}
          className={`overflow-y-scroll overflow-x-hidden bg-[linear-gradient(180deg,_rgba(248,250,252,0.75)_0%,_rgba(255,255,255,1)_18%)] ${dragging ? 'cursor-grabbing' : ''}`}
          style={{ height: 560 }}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
        >
          <div className="flex" style={{ height: totalHeight }}>
            {/* Hour labels */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="relative flex-shrink-0">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 text-[10px] font-medium text-slate-400 text-right leading-none"
                  style={{ top: yFor(h * 60) - 5 }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {loading
              ? weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="relative flex-1 border-l border-slate-200 bg-white/90"
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-slate-100"
                        style={{ top: yFor(h * 60) }}
                      />
                    ))}
                    {[0.15, 0.42, 0.7].map((frac, i) => (
                      <div
                        key={i}
                        className="absolute left-0.5 right-0.5 rounded bg-slate-200 animate-pulse"
                        style={{ top: totalHeight * frac, height: 32 + i * 20 }}
                      />
                    ))}
                  </div>
                ))
              : weekDays.map((day, colIdx) => {
                  const dateKey = day.toISOString().slice(0, 10)
                  const dayStartMs = day.getTime()
                  const isToday = isSameUTCDay(day, today)
                  const isPast = day.getTime() < today.getTime() && !isToday
                  const dayBookings = bookingsByDate.get(dateKey) ?? []
                  return (
                    <div
                      key={dateKey}
                      className={`relative flex-1 border-l border-slate-200 transition-colors ${
                        isToday ? 'bg-indigo-50/30' : isPast ? 'bg-slate-50/70' : 'bg-white'
                      } ${isPast || dragging ? 'cursor-default' : 'cursor-pointer hover:bg-indigo-50/20'}`}
                      onClick={(e) => {
                        if (isPast) return
                        if (dragMovedRef.current) {
                          dragMovedRef.current = false
                          return
                        }
                        const rect = e.currentTarget.getBoundingClientRect()
                        const clickedY =
                          e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0)
                        const clickedMin = TIMELINE_START + clickedY / TIMELINE_PX_PER_MIN
                        const roundedMin = Math.round(clickedMin / 5) * 5
                        const clampedMin = Math.max(
                          TIMELINE_START,
                          Math.min(TIMELINE_END - 30, roundedMin),
                        )
                        const startIso = new Date(dayStartMs + clampedMin * 60000).toISOString()
                        onSlotClick(dateKey, startIso)
                      }}
                    >
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0 border-t border-slate-100"
                          style={{ top: yFor(h * 60) }}
                        />
                      ))}
                      {hours.map((h) => (
                        <div
                          key={`hf-${h}`}
                          className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                          style={{ top: yFor(h * 60 + 30) }}
                        />
                      ))}

                      {isToday && hasCurrentTimeInRange && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{ top: currentLineTop }}
                        >
                          <div className="h-0 border-t-2 border-rose-500" />
                          <span className="absolute right-1 -top-3 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-semibold text-white animate-pulse">
                            Now
                          </span>
                        </div>
                      )}

                      {dayBookings.map((b) => {
                        const startMs = new Date(b.start_time).getTime()
                        const endMs = new Date(b.end_time).getTime()
                        const startMin = (startMs - dayStartMs) / 60000
                        const durMin = Math.max((endMs - startMs) / 60000, 5)
                        const top = yFor(startMin)
                        const height = Math.max(durMin * TIMELINE_PX_PER_MIN, 22)
                        const colors = WEEK_BLOCK_COLORS[b.status] ?? WEEK_BLOCK_COLORS.pending
                        const statusA11y =
                          STATUS_ACCESSIBILITY[b.status] ?? STATUS_ACCESSIBILITY.pending
                        const isPending = b.status === BookingStatus.PENDING
                        const isDragging = dragging?.booking.id === b.id
                        return (
                          <div
                            key={b.id}
                            className={`absolute left-0.5 right-0.5 rounded-xl px-1.5 overflow-hidden z-10 shadow-sm ring-1 ring-black/5 transition-opacity ${colors.bg} ${
                              isDragging
                                ? 'opacity-30 cursor-grabbing'
                                : `${colors.hover} cursor-grab`
                            }`}
                            style={{ top, height }}
                            onMouseDown={(e) => {
                              handleDragStart(e, b, dayStartMs)
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (dragMovedRef.current) {
                                dragMovedRef.current = false
                                return
                              }
                              onBookingClick(b)
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setContextMenu({ booking: b, x: e.clientX, y: e.clientY })
                            }}
                          >
                            <div className="flex items-start justify-between gap-1 pt-0.5">
                              <p
                                className={`text-[9px] font-bold truncate leading-tight ${isPending ? 'text-slate-900' : 'text-white'}`}
                              >
                                {formatTime(b.start_time)}
                              </p>
                              {height >= 28 && (
                                <span
                                  className={`rounded border px-1 py-0.5 text-[8px] font-bold leading-none ${isPending ? 'border-black/20 bg-black/10 text-slate-900' : 'border-white/60 bg-white/15 text-white'}`}
                                >
                                  {statusA11y.short}
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[9px] truncate ${isPending ? 'text-slate-800' : 'text-white/90'}`}
                            >
                              {b.customer_name}
                            </p>
                            {height >= 42 && b.booking_services?.name && (
                              <p
                                className={`text-[8px] truncate ${isPending ? 'text-slate-700' : 'text-white/70'}`}
                              >
                                {b.booking_services.name}
                              </p>
                            )}
                          </div>
                        )
                      })}

                      {/* Drag ghost */}
                      {dragging &&
                        dragOver?.colIdx === colIdx &&
                        (() => {
                          const ghostTop = yFor(dragOver.startMin)
                          const ghostHeight = Math.max(dragging.durMin * TIMELINE_PX_PER_MIN, 22)
                          const hh = String(Math.floor(dragOver.startMin / 60)).padStart(2, '0')
                          const mm = String(dragOver.startMin % 60).padStart(2, '0')
                          return (
                            <div
                              className={`absolute left-0.5 right-0.5 rounded border-2 border-dashed z-20 pointer-events-none ${
                                dragConflict
                                  ? 'border-red-500 bg-red-100/75'
                                  : 'border-indigo-500 bg-indigo-100/70'
                              }`}
                              style={{ top: ghostTop, height: ghostHeight }}
                            >
                              <p
                                className={`text-[9px] font-semibold px-1.5 pt-0.5 ${dragConflict ? 'text-red-700' : 'text-indigo-700'}`}
                              >
                                {hh}:{mm}
                                {dragConflict ? ' conflict' : ''}
                              </p>
                            </div>
                          )
                        })()}
                    </div>
                  )
                })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-slate-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] text-[10px] text-slate-500 flex-wrap">
          {Object.entries(WEEK_BLOCK_COLORS).map(([status, colors]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`inline-block w-3 h-3 rounded-sm ${colors.bg}`} />
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-bold ${STATUS_ACCESSIBILITY[status]?.pill ?? STATUS_ACCESSIBILITY.pending.pill}`}
              >
                {STATUS_ACCESSIBILITY[status]?.short ?? STATUS_ACCESSIBILITY.pending.short}
              </span>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          ))}
          <button
            type="button"
            onClick={scrollToNow}
            className="ui-tap ui-focus rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to now
          </button>
          <span className="italic text-slate-400">
            Click to book · Drag to reschedule · Red ghost means overlap · Right-click for status
          </span>
        </div>

        {/* Right-click status context menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[168px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              Change status
            </p>
            {statusActions
              .filter((s) => s !== contextMenu.booking.status)
              .map((status) => (
                <button
                  key={status}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => {
                    onStatusChange(contextMenu.booking.id, status)
                    setContextMenu(null)
                  }}
                >
                  Mark as {status}
                </button>
              ))}
          </div>
        )}
      </div>
    </>
  )
}
// ─── Timeline slot picker ─────────────────────────────────────────────────────

const TIMELINE_PX_PER_MIN = 1.5
const TIMELINE_START_HOUR = 8
const TIMELINE_END_HOUR = 19

export function SlotTimeline({
  date,
  availableSlots,
  existingBookings,
  selectedIso,
  durationMinutes,
  onBookingClick,
  onSelect,
}: {
  date: string
  availableSlots: SlotOption[]
  existingBookings: BookingWithService[]
  selectedIso: string
  durationMinutes: number
  onBookingClick?: (booking: BookingWithService) => void
  onSelect: (iso: string) => void
}) {
  const TIMELINE_START = TIMELINE_START_HOUR * 60
  const TIMELINE_END = TIMELINE_END_HOUR * 60
  const totalMinutes = TIMELINE_END - TIMELINE_START
  const totalHeight = totalMinutes * TIMELINE_PX_PER_MIN

  const containerRef = useRef<HTMLDivElement>(null)

  const dayStartMs = useMemo(() => new Date(`${date}T00:00:00Z`).getTime(), [date])

  // Build contiguous available ranges for the green tint background
  const availableRanges = useMemo(() => {
    if (availableSlots.length === 0) return []
    const sorted = [...availableSlots].map((s) => timeHHMMToMins(s.time)).sort((a, b) => a - b)
    const ranges: { start: number; end: number }[] = []
    let rangeStart = sorted[0]
    let prev = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      const m = sorted[i]
      if (m - prev <= 10) {
        prev = m
      } else {
        ranges.push({ start: rangeStart, end: prev + durationMinutes })
        rangeStart = m
        prev = m
      }
    }
    ranges.push({ start: rangeStart, end: prev + durationMinutes })
    return ranges
  }, [availableSlots, durationMinutes])

  // Compute pixel positions for existing bookings
  const bookingBlocks = useMemo(
    () =>
      existingBookings.map((b) => {
        const startMs = new Date(b.start_time).getTime()
        const endMs = new Date(b.end_time).getTime()
        const startMin = (startMs - dayStartMs) / 60000
        const durMin = Math.max((endMs - startMs) / 60000, 5)
        return {
          id: b.id,
          booking: b,
          startMin,
          durMin,
          name: b.customer_name,
          service: b.booking_services?.name ?? '',
          status: b.status,
        }
      }),
    [existingBookings, dayStartMs],
  )

  // Selected slot in minutes since midnight UTC
  const selectedMin = useMemo(
    () => (selectedIso ? (new Date(selectedIso).getTime() - dayStartMs) / 60000 : null),
    [selectedIso, dayStartMs],
  )

  const yFor = useCallback(
    (mins: number) => (mins - TIMELINE_START) * TIMELINE_PX_PER_MIN,
    [TIMELINE_START],
  )

  // Scroll to selected or first available slot when date/slots change
  const firstSlotTime = availableSlots[0]?.time ?? ''
  useEffect(() => {
    if (!containerRef.current) return
    const targetMin = selectedMin ?? (firstSlotTime ? timeHHMMToMins(firstSlotTime) : null)
    if (targetMin === null) return
    const y = (targetMin - TIMELINE_START) * TIMELINE_PX_PER_MIN
    containerRef.current.scrollTop = Math.max(0, y - 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, firstSlotTime, selectedIso])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (availableSlots.length === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const clickedY = e.clientY - rect.top + e.currentTarget.scrollTop
      // subtract the label column width (40px)
      const bodyX = e.clientX - rect.left - 40
      if (bodyX < 0) return // clicked label column, ignore
      const clickedMin = TIMELINE_START + clickedY / TIMELINE_PX_PER_MIN
      let nearest = availableSlots[0]
      let minDist = Math.abs(timeHHMMToMins(nearest.time) - clickedMin)
      for (const slot of availableSlots) {
        const dist = Math.abs(timeHHMMToMins(slot.time) - clickedMin)
        if (dist < minDist) {
          minDist = dist
          nearest = slot
        }
      }
      onSelect(nearest.isoString)
    },
    [availableSlots, onSelect, TIMELINE_START],
  )

  const hours: number[] = []
  for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) hours.push(h)

  const noSlotsMsg =
    availableSlots.length === 0
      ? 'No available slots — all times are booked or outside working hours.'
      : null

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {noSlotsMsg ? (
        <div className="h-80 flex items-center justify-center text-slate-400 text-sm bg-slate-50">
          {noSlotsMsg}
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex items-center gap-4 px-3 py-2 border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-400" />
              Available — click to select
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" />
              Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-100 border-2 border-indigo-600" />
              Selected
            </span>
          </div>

          {/* Scrollable timeline */}
          <div
            ref={containerRef}
            className="relative overflow-y-scroll overflow-x-hidden cursor-pointer select-none"
            style={{ height: 320 }}
            onClick={handleClick}
            title="Click to select a time"
          >
            <div className="relative" style={{ height: totalHeight }}>
              {/* ── Hour labels (left 40px) ── */}
              {hours.map((h) => (
                <div
                  key={`lbl-${h}`}
                  className="absolute left-0 w-10 text-[10px] font-medium text-slate-400 leading-none text-right pr-2"
                  style={{ top: yFor(h * 60) - 5 }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}

              {/* ── Timeline body (inset 40px from left) ── */}
              <div className="absolute inset-y-0 left-10 right-0">
                {/* Hour grid lines */}
                {hours.map((h) => (
                  <div
                    key={`hour-line-${h}`}
                    className="absolute left-0 right-0 border-t border-slate-200"
                    style={{ top: yFor(h * 60) }}
                  />
                ))}
                {/* 30-min dashed lines */}
                {hours.map((h) => (
                  <div
                    key={`half-line-${h}`}
                    className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                    style={{ top: yFor(h * 60 + 30) }}
                  />
                ))}

                {/* Available regions (green tint) */}
                {availableRanges.map((r, i) => {
                  const top = yFor(r.start)
                  const height = (r.end - r.start) * TIMELINE_PX_PER_MIN
                  if (top + height < 0 || top > totalHeight) return null
                  return (
                    <div
                      key={`avail-${i}`}
                      className="absolute left-0 right-0 bg-emerald-50 border-l-2 border-emerald-400 pointer-events-none"
                      style={{ top, height }}
                    />
                  )
                })}

                {/* Existing booking blocks */}
                {bookingBlocks.map((b) => {
                  const top = yFor(b.startMin)
                  const height = Math.max(b.durMin * TIMELINE_PX_PER_MIN, 18)
                  if (top + height < 0 || top > totalHeight) return null
                  return (
                    <button
                      type="button"
                      key={b.id}
                      className="absolute left-1 right-1 rounded bg-indigo-500 px-2 overflow-hidden z-10 shadow-sm ring-1 ring-indigo-300/30 hover:bg-indigo-600"
                      style={{ top, height }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onBookingClick?.(b.booking)
                      }}
                      title="Click to open edit / reschedule"
                    >
                      <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/80" />
                      <p className="text-[10px] font-semibold text-white truncate leading-tight pt-0.5">
                        {b.name}
                      </p>
                      {b.service && (
                        <p className="text-[9px] text-indigo-200 truncate">{b.service}</p>
                      )}
                    </button>
                  )
                })}

                {/* Selected appointment block */}
                {selectedMin !== null && (
                  <div
                    className="absolute left-1 right-1 rounded-lg border-2 border-indigo-600 bg-indigo-100 z-20 pointer-events-none"
                    style={{
                      top: yFor(selectedMin),
                      height: Math.max(durationMinutes * TIMELINE_PX_PER_MIN, 20),
                    }}
                  >
                    <p className="text-[10px] font-semibold text-indigo-700 px-2 pt-0.5">
                      {formatTime(selectedIso)} — {durationMinutes} min
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Booking row ──────────────────────────────────────────────────────────────

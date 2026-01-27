'use client'

import React from 'react'
import { STAT_CARD_COLORS } from '../constants'

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  color: 'blue' | 'slate' | 'red' | 'amber'
}

/**
 * Stat Card Component - Displays statistics with icon and color coding
 * Memoized to prevent unnecessary re-renders
 */
export const StatCard = React.memo(function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <div className={`bg-gradient-to-br ${STAT_CARD_COLORS[color]} rounded-xl p-4 border shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase opacity-70">{label}</span>
        <Icon className="w-4 h-4 opacity-50" />
      </div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  )
})

StatCard.displayName = 'StatCard'

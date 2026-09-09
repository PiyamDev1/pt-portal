import { z } from 'zod'

export const loyaltySearchSchema = z.string().trim().max(100).default('')

export const loyaltyAdjustmentSchema = z
  .object({
    points: z.number().int().min(-100_000).max(100_000).refine((value) => value !== 0, {
      message: 'Enter a non-zero points adjustment.',
    }),
    reason: z.string().trim().min(5).max(300),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export type LoyaltyOverview = {
  memberCount: number
  portalLinkedCount: number
  availablePoints: number
  pendingPoints: number
  entriesLast30Days: number
}

export type LoyaltyMember = {
  id: string
  customerCode: string
  name: string
  email: string
  phone: string | null
  status: string
  portalLinked: boolean
  availablePoints: number
  pendingPoints: number
  lifetimePoints: number
  entryCount: number
  joinedAt: string
  lastActivityAt: string | null
}

export type LoyaltyEntry = {
  id: string
  description: string
  points: number
  state: 'pending' | 'available' | 'reversed'
  sourceType: 'ticket' | 'service' | 'package' | 'adjustment'
  createdAt: string
  adjustedBy: string | null
}

export type LoyaltyTier = {
  name: string
  minimumPoints: number
  multiplier: number
}

export type LoyaltyDashboardPayload = {
  overview: LoyaltyOverview
  members: LoyaltyMember[]
  tiers: LoyaltyTier[]
  totalMembers: number
  canAdjust: boolean
  loadedAt: string
}

export type LoyaltyMemberPayload = {
  member: LoyaltyMember
  entries: LoyaltyEntry[]
}

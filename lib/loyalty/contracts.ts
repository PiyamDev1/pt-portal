import { z } from 'zod'
import type { LoyaltyProgramPolicy } from './program'
import type { LoyaltyBonusCampaign, LoyaltyCampaignEvent } from './programServer'

export const loyaltySearchSchema = z.string().trim().max(100).default('')

export const loyaltyAdjustmentSchema = z
  .object({
    points: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((value) => value !== 0, {
        message: 'Enter a non-zero points adjustment.',
      }),
    reason: z.string().trim().min(5).max(300),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export const loyaltyMemberServiceLookupSchema = z
  .object({
    customerCode: z.string().trim().min(1).max(512),
    locationId: z.string().uuid(),
  })
  .strict()

export const loyaltyMemberServiceConsumeSchema = loyaltyMemberServiceLookupSchema
  .extend({
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export const loyaltyProgramMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('UPDATE_EARNING_RULE'),
      ruleKey: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/),
      points: z.number().int().min(1).max(100_000),
      isActive: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('UPSERT_VOUCHER_REWARD'),
      pointsCost: z.number().int().min(1).max(1_000_000),
      valuePence: z.number().int().min(1).max(1_000_000),
      validityMonths: z.number().int().min(1).max(36),
      displayOrder: z.number().int().min(0).max(1_000_000),
      isActive: z.boolean(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.isActive && value.pointsCost < value.valuePence * 2) {
        context.addIssue({
          code: 'custom',
          path: ['pointsCost'],
          message: 'Active vouchers require at least 200 points for each pound of value.',
        })
      }
    }),
  z
    .object({
      action: z.literal('UPDATE_VOUCHER_POINTS'),
      currentPointsCost: z.number().int().min(1).max(1_000_000),
      pointsCost: z.number().int().min(1).max(1_000_000),
    })
    .strict(),
  z
    .object({
      action: z.literal('DELETE_VOUCHER_REWARD'),
      pointsCost: z.number().int().min(1).max(1_000_000),
    })
    .strict(),
  z
    .object({
      action: z.literal('CREATE_CAMPAIGN_EVENT'),
      name: z.string().trim().min(3).max(100),
      description: z.string().trim().max(500).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('UPDATE_CAMPAIGN_EVENT'),
      id: z.string().uuid(),
      name: z.string().trim().min(3).max(100),
      description: z.string().trim().max(500).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('DELETE_CAMPAIGN_EVENT'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('DELETE_BONUS_CAMPAIGN'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('UPSERT_BONUS_CAMPAIGN'),
      id: z.string().uuid().optional(),
      eventId: z.string().uuid(),
      ruleName: z.string().trim().min(2).max(100),
      eventType: z.enum([
        'double_points',
        'fixed_bonus',
        'welcome_bonus',
        'referral_bonus',
        'off_peak_bonus',
        'birthday_gift',
        'eid_gift',
      ]),
      multiplier: z.number().min(1.01).max(20).nullable(),
      bonusPoints: z.number().int().min(1).max(100_000).nullable(),
      referredCustomerPoints: z.number().int().min(1).max(100_000).nullable(),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }),
      eligibleServiceKeys: z.array(z.string().min(1).max(80)).max(50),
      eligibleBranchIds: z.array(z.string().uuid()).max(50),
      audienceTiers: z
        .array(z.enum(['Bronze', 'Silver', 'Gold', 'Platinum', 'Ruby', 'Diamond', 'Kryptonite']))
        .min(1)
        .max(7),
      maxAwardsPerCustomer: z.number().int().min(1).max(1_000),
      minimumSpendPence: z.number().int().min(0).max(100_000_000),
      priority: z.number().int().min(1).max(1_000),
      linkedCampaignId: z.string().uuid().nullable(),
      perCustomerCap: z.number().int().min(1).max(1_000_000),
      totalPointsBudget: z.number().int().min(1).max(100_000_000),
      allowStacking: z.boolean(),
      status: z.enum(['draft', 'scheduled', 'active', 'ended', 'cancelled']),
      terms: z.string().trim().max(1_000).nullable(),
    })
    .strict()
    .superRefine((value, context) => {
      if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
        context.addIssue({ code: 'custom', message: 'End time must be after start time.' })
      }
      if (value.eventType === 'double_points' && value.multiplier === null) {
        context.addIssue({ code: 'custom', message: 'A multiplier is required.' })
      }
      if (value.eventType !== 'double_points' && value.bonusPoints === null) {
        context.addIssue({ code: 'custom', message: 'Bonus points are required.' })
      }
      if (value.eventType === 'referral_bonus' && value.referredCustomerPoints === null) {
        context.addIssue({ code: 'custom', message: 'New-customer points are required.' })
      }
      if (value.eventType === 'referral_bonus' && value.audienceTiers.length !== 7) {
        context.addIssue({
          code: 'custom',
          path: ['audienceTiers'],
          message: 'Referral campaigns must remain available to all ranks.',
        })
      }
      if (
        value.bonusPoints !== null &&
        value.bonusPoints * value.maxAwardsPerCustomer > value.perCustomerCap
      ) {
        context.addIssue({
          code: 'custom',
          path: ['perCustomerCap'],
          message: 'The customer points cap must cover the configured award count.',
        })
      }
    }),
  z
    .object({
      action: z.literal('UPDATE_RANK'),
      rankKey: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
      minimumPoints: z.number().int().min(0).max(10_000_000),
      maximumPoints: z.number().int().min(0).max(10_000_000).nullable(),
      maintenancePoints: z.number().int().min(0).max(10_000_000),
      walkInAllowance: z.number().int().min(0).max(100),
      callbackPriority: z.number().int().min(0).max(10),
      waitlistPriority: z.number().int().min(0).max(10),
      perks: z.array(z.string().trim().min(2).max(160)).max(12),
      confirmCustomerImpact: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('UPDATE_ACHIEVEMENT'),
      achievementKey: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().min(5).max(240),
      requiredTransactions: z.number().int().min(1).max(100_000),
      bonusPoints: z.number().int().min(1).max(100_000),
      isActive: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('UPSERT_WALKIN_WINDOW'),
      id: z.string().uuid().optional(),
      locationId: z.string().uuid(),
      serviceType: z.enum(['nadra', 'passport']),
      isoWeekday: z.number().int().min(1).max(7),
      startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      isActive: z.boolean(),
    })
    .strict()
    .refine((value) => value.endsAt > value.startsAt, {
      message: 'The walk-in end time must be after its start time.',
      path: ['endsAt'],
    }),
  z
    .object({
      action: z.literal('DELETE_WALKIN_WINDOW'),
      id: z.string().uuid(),
    })
    .strict(),
])

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
  rankPoints: number
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
  program: LoyaltyProgramPolicy
  campaignEvents: LoyaltyCampaignEvent[]
  campaigns: LoyaltyBonusCampaign[]
  campaignOptions: {
    services: Array<{ key: string; label: string; category: string }>
    branches: Array<{ id: string; name: string }>
    walkInWindows: Array<{
      id: string
      locationId: string
      serviceType: 'nadra' | 'passport'
      isoWeekday: number
      startsAt: string
      endsAt: string
      isActive: boolean
    }>
  }
}

export type LoyaltyMemberPayload = {
  member: LoyaltyMember
  entries: LoyaltyEntry[]
}

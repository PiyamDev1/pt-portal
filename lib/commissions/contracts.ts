import { z } from 'zod'

export const COMMISSION_CAPABILITY_VERSION = 2026082903
export const COMMISSION_PROFILE_CAPABILITY_VERSION = 2026083002
export const COMMISSION_PACKAGE_CAPABILITY_VERSION = 2026083003
export const COMMISSION_PACKAGE_READINESS_CAPABILITY_VERSION = 2026083004
export const COMMISSION_APPLICATION_CAPABILITY_VERSION = 2026083007
export const COMMISSION_PROFILE_EDITING_CAPABILITY_VERSION = 2026083008
export const COMMISSION_TICKETING_WAIVER_CAPABILITY_VERSION = 2026083101
export const COMMISSION_ACCOUNTING_CAPABILITY_VERSION = 2026090201

export const commissionSourceModules = ['ticketing', 'packages', 'applications'] as const
export const commissionServiceCodes = [
  'tk_primary',
  'tk_assistance',
  'dc',
  'r_er',
  'low_fare',
  'higher_fare',
  'package_sale',
  'application_nadra',
  'application_nadra_urgent',
  'application_passport_pk',
  'application_passport_pk_urgent',
  'application_passport_gb',
  'application_visa',
  'sales_bonus',
] as const
export const commissionRecipientRoles = [
  'primary',
  'assistant',
  'low_fare_actor',
  'package_sales',
  'application_agent',
  'sales_bonus',
] as const
export const commissionComponentTypes = [
  'fixed_per_unit',
  'fixed_per_event',
  'percentage_of_variable',
  'signed_percentage',
  'explicit_zero',
  'marginal_ticket_tier',
  'fixed_package',
  'fixed_package_per_passenger',
  'percentage_of_package_profit',
  'sales_profit_bonus',
] as const

const uuidSchema = z.string().uuid()
export const commissionCurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a three-letter ISO currency code')
const optionalMoneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,6})?$/, 'Enter a non-negative decimal value')
  .optional()
const sourceVariableSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use a supported source-variable key')

export const commissionTierSchema = z
  .object({
    minUnit: z.number().int().min(1).max(1_000_000),
    rateGbp: z
      .string()
      .trim()
      .regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  })
  .strict()

export const commissionComponentSchema = z
  .object({
    componentType: z.enum(commissionComponentTypes),
    sourceVariable: sourceVariableSchema.optional(),
    recipientRole: z.enum(commissionRecipientRoles),
    rateValue: optionalMoneySchema,
    minimumAmountGbp: optionalMoneySchema,
    maximumAmountGbp: optionalMoneySchema,
    thresholdGbp: optionalMoneySchema,
    rewardKind: z.enum(['fixed_gbp', 'percentage_of_qualifying_profit']).optional(),
    rewardValue: optionalMoneySchema,
    eligibleServices: z
      .array(z.enum(commissionServiceCodes))
      .max(commissionServiceCodes.length)
      .default([]),
    tiers: z.array(commissionTierSchema).max(25).optional(),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((component, context) => {
    const bonus = component.componentType === 'sales_profit_bonus'
    const tiered = component.componentType === 'marginal_ticket_tier'
    const zero = component.componentType === 'explicit_zero'
    const needsVariable = [
      'fixed_per_unit',
      'percentage_of_variable',
      'signed_percentage',
      'fixed_package_per_passenger',
      'percentage_of_package_profit',
    ].includes(component.componentType)

    if (needsVariable && !component.sourceVariable) {
      context.addIssue({
        code: 'custom',
        path: ['sourceVariable'],
        message: 'This component requires a supported source variable',
      })
    }
    if (!bonus && !tiered && !zero && component.rateValue === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['rateValue'],
        message: 'This component requires a rate',
      })
    }
    if (tiered && (!component.tiers || component.tiers.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['tiers'],
        message: 'A marginal component requires at least one tier',
      })
    }
    if (component.tiers) {
      const starts = component.tiers.map((tier) => tier.minUnit)
      if (new Set(starts).size !== starts.length || Math.min(...starts) !== 1) {
        context.addIssue({
          code: 'custom',
          path: ['tiers'],
          message: 'Tier starts must be unique and begin at unit 1',
        })
      }
    }
    if (
      bonus &&
      (!component.thresholdGbp ||
        !component.rewardKind ||
        component.rewardValue === undefined ||
        component.eligibleServices.length === 0 ||
        component.recipientRole !== 'sales_bonus')
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A sales bonus requires a target, reward, eligible service, and sales-bonus recipient',
      })
    }
    if (
      !bonus &&
      (component.thresholdGbp !== undefined ||
        component.rewardKind !== undefined ||
        component.rewardValue !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'Bonus fields are only valid for a sales bonus' })
    }
  })

export const createCommissionPolicySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
  })
  .strict()

export const createCommissionPolicyVersionSchema = z
  .object({ components: z.array(commissionComponentSchema).min(1).max(50) })
  .strict()

export const activateCommissionPolicyVersionSchema = z.object({}).strict()

export const createCommissionAssignmentSchema = z
  .object({
    employeeId: uuidSchema,
    policyVersionId: uuidSchema,
    sourceModule: z.enum(commissionSourceModules),
    serviceCode: z.enum(commissionServiceCodes),
    recipientRole: z.enum(commissionRecipientRoles),
    locationId: uuidSchema.nullable().optional(),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date().nullable().optional(),
  })
  .strict()
  .superRefine((assignment, context) => {
    if (assignment.effectiveTo && assignment.effectiveTo < assignment.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'The end date cannot precede the start date',
      })
    }
  })

export const commissionProcessSchema = z
  .object({ limit: z.number().int().min(1).max(200).default(50) })
  .strict()

export const commissionRetrySchema = z.object({}).strict()

export const commissionMonthlyExchangeRateSchema = z
  .object({
    currency: commissionCurrencyCodeSchema.refine((currency) => currency !== 'GBP', {
      message: 'GBP is the book currency and always uses a rate of 1',
    }),
    periodStart: z.iso.date(),
    unitsPerGbp: z.number().finite().positive().max(1_000_000_000),
  })
  .strict()
  .refine((value) => value.periodStart.endsWith('-01'), {
    path: ['periodStart'],
    message: 'The exchange-rate month must begin on day 1',
  })

export const commissionPreviewSchema = z
  .object({
    component: commissionComponentSchema,
    variables: z
      .object({
        units: z.number().int().min(0).max(100_000).optional(),
        basisValueGbp: z
          .string()
          .trim()
          .regex(/^-?\d{1,12}(?:\.\d{1,2})?$/)
          .optional(),
        qualifyingProfitGbp: z
          .string()
          .trim()
          .regex(/^-?\d{1,12}(?:\.\d{1,2})?$/)
          .optional(),
        incompleteInputCount: z.number().int().min(0).max(1_000_000).default(0),
      })
      .strict(),
  })
  .strict()
  .superRefine((preview, context) => {
    if (
      ['fixed_per_unit', 'fixed_package_per_passenger', 'marginal_ticket_tier'].includes(
        preview.component.componentType,
      ) &&
      preview.variables.units === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['variables', 'units'],
        message: 'Units are required',
      })
    }
    if (
      ['percentage_of_variable', 'signed_percentage', 'percentage_of_package_profit'].includes(
        preview.component.componentType,
      ) &&
      preview.variables.basisValueGbp === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['variables', 'basisValueGbp'],
        message: 'A GBP basis is required',
      })
    }
    if (
      preview.component.componentType === 'sales_profit_bonus' &&
      preview.variables.qualifyingProfitGbp === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['variables', 'qualifyingProfitGbp'],
        message: 'Qualifying profit is required',
      })
    }
  })

export const commissionIdParamSchema = z.object({ id: uuidSchema }).strict()
export const commissionPolicyParamSchema = z.object({ policyId: uuidSchema }).strict()
export const commissionVersionParamSchema = z
  .object({ policyId: uuidSchema, versionId: uuidSchema })
  .strict()

export type CommissionComponentInput = z.infer<typeof commissionComponentSchema>
export type CreateCommissionAssignmentInput = z.infer<typeof createCommissionAssignmentSchema>

/**
 * Employee agreement editor contract.
 *
 * Policies and assignments remain the immutable calculation primitives. A profile is
 * the employee-owned snapshot that creates those primitives atomically, so copying
 * another employee's setup never keeps the two employees linked.
 */
export const COMMISSION_PROFILE_SERVICE_CODES = [
  'tk_primary',
  'tk_assistance',
  'dc',
  'r_er',
  'low_fare',
  'higher_fare',
  'package_sale',
  'application_nadra',
  'application_nadra_urgent',
  'application_passport_pk',
  'application_passport_pk_urgent',
  'application_passport_gb',
  'application_visa',
] as const

export type CommissionProfileServiceCode = (typeof COMMISSION_PROFILE_SERVICE_CODES)[number]

export const COMMISSION_SERVICE_LABELS: Record<
  CommissionProfileServiceCode | 'sales_bonus',
  string
> = {
  tk_primary: 'Ticket sales',
  tk_assistance: 'Ticket assistance',
  dc: 'Date changes',
  r_er: 'Reissues',
  low_fare: 'Low-fare savings',
  higher_fare: 'Supplier fare increase adjustments',
  package_sale: 'Package sales',
  application_nadra: 'NADRA applications - normal',
  application_nadra_urgent: 'NADRA applications - urgent / executive',
  application_passport_pk: 'Pakistani passport applications - normal',
  application_passport_pk_urgent: 'Pakistani passport applications - urgent / executive',
  application_passport_gb: 'British passport applications',
  application_visa: 'Visa applications',
  sales_bonus: 'Monthly profit bonus',
}

export const COMMISSION_RATE_KINDS = [
  'none',
  'per_unit',
  'per_event',
  'percentage',
  'full_difference',
  'tiered',
] as const

export type CommissionRateKind = (typeof COMMISSION_RATE_KINDS)[number]

export const commissionAssistanceScopeSchema = z
  .object({
    mode: z.enum(['all', 'specific_agents']).default('all'),
    employeeIds: z.array(uuidSchema).max(100).default([]),
    agentRates: z
      .array(
        z
          .object({
            employeeId: uuidSchema,
            value: z.number().finite().min(0).max(1_000_000),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict()

export type CommissionAssistanceScope = z.infer<typeof commissionAssistanceScopeSchema>

export const commissionApplicationRoutingSchema = z
  .object({
    mode: z.enum(['self', 'another_employee', 'none']).default('self'),
    recipientEmployeeId: uuidSchema.nullable().default(null),
  })
  .strict()

export type CommissionApplicationRouting = z.infer<typeof commissionApplicationRoutingSchema>

const profileTierSchema = z
  .object({
    minUnit: z.number().int().min(1).max(100_000),
    rateGbp: z.number().finite().min(0).max(100_000),
  })
  .strict()

export const commissionRateSchema = z
  .object({
    kind: z.enum(COMMISSION_RATE_KINDS),
    value: z.number().finite().min(0).max(1_000_000).default(0),
    tiers: z.array(profileTierSchema).max(12).default([]),
    currency: commissionCurrencyCodeSchema.nullable().default(null),
  })
  .strict()
  .superRefine((rate, context) => {
    if (rate.kind === 'percentage' && rate.value > 100) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Percentage rates cannot exceed 100%',
      })
    }

    if (rate.kind === 'full_difference' && rate.value !== 100) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'A full-difference adjustment must use 100%',
      })
    }

    if (rate.kind !== 'tiered') return
    if (rate.tiers.length === 0) {
      context.addIssue({ code: 'custom', path: ['tiers'], message: 'Add at least one tier' })
      return
    }

    const ordered = [...rate.tiers].sort((left, right) => left.minUnit - right.minUnit)
    if (ordered[0]?.minUnit !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['tiers'],
        message: 'Tiered rates must begin at unit 1',
      })
    }
    if (new Set(ordered.map((tier) => tier.minUnit)).size !== ordered.length) {
      context.addIssue({
        code: 'custom',
        path: ['tiers'],
        message: 'Each tier must begin at a different ticket number',
      })
    }
  })

export const commissionProfileSchema = z
  .object({
    employeeId: uuidSchema,
    label: z.string().trim().min(2).max(100),
    effectiveFrom: z.iso.date(),
    locationId: uuidSchema.nullable().default(null),
    copiedFromProfileId: uuidSchema.nullable().default(null),
    changeReason: z.string().trim().min(8).max(500),
    services: z
      .object({
        tkPrimary: commissionRateSchema,
        tkAssistance: commissionRateSchema.refine(
          (rate) =>
            rate.kind !== 'percentage' && rate.kind !== 'full_difference' && rate.kind !== 'tiered',
          'Assistance can be paid per ticket, per booking, or explicitly set to zero',
        ),
        dateChange: commissionRateSchema.refine(
          (rate) => rate.kind !== 'tiered' && rate.kind !== 'full_difference',
          'Date changes do not support volume tiers',
        ),
        reissue: commissionRateSchema.refine(
          (rate) => rate.kind !== 'tiered' && rate.kind !== 'full_difference',
          'Reissues do not support volume tiers',
        ),
        lowFare: commissionRateSchema.refine(
          (rate) => ['none', 'per_unit', 'percentage'].includes(rate.kind),
          'Low-fare commission must be fixed per ticket, a percentage, or zero',
        ),
        higherFare: commissionRateSchema.refine(
          (rate) => ['none', 'percentage', 'full_difference'].includes(rate.kind),
          'A supplier fare increase adjustment must be the full difference, a percentage, or zero',
        ),
        packageSale: commissionRateSchema.refine(
          (rate) => rate.kind !== 'full_difference',
          'Package sales do not support fare-difference adjustments',
        ),
        applicationNadra: commissionRateSchema.refine(
          (rate) => ['none', 'per_event'].includes(rate.kind),
          'NADRA applications support a fixed completed-application rate or zero',
        ),
        applicationNadraUrgent: commissionRateSchema.refine(
          (rate) => ['none', 'per_event'].includes(rate.kind),
          'Urgent NADRA applications support a fixed completed-application rate or zero',
        ),
        applicationPassportPk: commissionRateSchema.refine(
          (rate) => ['none', 'per_event'].includes(rate.kind),
          'Pakistani passport applications support a fixed collected-application rate or zero',
        ),
        applicationPassportPkUrgent: commissionRateSchema.refine(
          (rate) => ['none', 'per_event'].includes(rate.kind),
          'Urgent Pakistani passport applications support a fixed collected-application rate or zero',
        ),
        applicationPassportGb: commissionRateSchema.refine(
          (rate) => ['none', 'per_event'].includes(rate.kind),
          'British passport applications support a fixed completed-application rate or zero',
        ),
        applicationVisa: commissionRateSchema.refine(
          (rate) => ['none', 'per_event'].includes(rate.kind),
          'Visa applications support a fixed completed-application rate or zero',
        ),
      })
      .strict(),
    assistanceScope: commissionAssistanceScopeSchema.default({
      mode: 'all',
      employeeIds: [],
      agentRates: [],
    }),
    applicationRouting: commissionApplicationRoutingSchema.default({
      mode: 'self',
      recipientEmployeeId: null,
    }),
    ticketTierOptions: z
      .object({ includeDateChanges: z.boolean().default(false) })
      .strict()
      .default({ includeDateChanges: false }),
    compensation: z
      .object({
        currency: commissionCurrencyCodeSchema.default('GBP'),
        salaryCurrency: commissionCurrencyCodeSchema.nullable().default(null),
        monthlySalary: z.number().finite().min(0).max(1_000_000_000).default(0),
      })
      .strict()
      .default({ currency: 'GBP', salaryCurrency: null, monthlySalary: 0 }),
    ticketRefundCommission: z
      .object({ treatment: z.enum(['retain', 'reverse_original']).default('retain') })
      .strict()
      .default({ treatment: 'retain' }),
    monthlyBonus: z
      .object({
        enabled: z.boolean(),
        thresholdGbp: z.number().finite().min(0).max(100_000_000),
        rewardKind: z.enum(['fixed_gbp', 'percentage_of_qualifying_profit']),
        rewardValue: z.number().finite().min(0).max(1_000_000),
        currency: commissionCurrencyCodeSchema.nullable().default(null),
        steps: z
          .array(
            z
              .object({
                thresholdGbp: z.number().finite().min(0).max(100_000_000),
                rewardKind: z.enum(['fixed_gbp', 'percentage_of_qualifying_profit']),
                rewardValue: z.number().finite().min(0).max(1_000_000),
              })
              .strict(),
          )
          .max(24)
          .default([]),
        recurring: z
          .object({
            enabled: z.boolean().default(false),
            startsAtGbp: z.number().finite().min(0).max(100_000_000).default(0),
            intervalGbp: z.number().finite().positive().max(100_000_000).default(1_000),
            rewardKind: z
              .enum(['fixed_gbp', 'percentage_of_qualifying_profit'])
              .default('fixed_gbp'),
            rewardValue: z.number().finite().min(0).max(1_000_000).default(0),
            maxOccurrences: z.number().int().positive().max(10_000).nullable().default(null),
          })
          .strict()
          .default({
            enabled: false,
            startsAtGbp: 0,
            intervalGbp: 1_000,
            rewardKind: 'fixed_gbp',
            rewardValue: 0,
            maxOccurrences: null,
          }),
        eligibleServices: z
          .array(z.enum(['tk_primary', 'dc', 'r_er']))
          .min(1)
          .max(3)
          .default(['tk_primary']),
      })
      .strict(),
  })
  .strict()
  .superRefine((profile, context) => {
    const applicationRecipientId = profile.applicationRouting.recipientEmployeeId
    if (profile.applicationRouting.mode === 'another_employee' && applicationRecipientId === null) {
      context.addIssue({
        code: 'custom',
        path: ['applicationRouting', 'recipientEmployeeId'],
        message: 'Select the employee who should receive Application commission',
      })
    }
    if (
      profile.applicationRouting.mode === 'another_employee' &&
      applicationRecipientId === profile.employeeId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['applicationRouting', 'recipientEmployeeId'],
        message: 'Use Pay this employee instead of redirecting commission to the same employee',
      })
    }
    if (profile.applicationRouting.mode !== 'another_employee' && applicationRecipientId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['applicationRouting', 'recipientEmployeeId'],
        message: 'Only redirected Application commission can have another recipient',
      })
    }

    const { mode, employeeIds, agentRates } = profile.assistanceScope
    if (new Set(employeeIds).size !== employeeIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['assistanceScope', 'employeeIds'],
        message: 'Each primary agent can be selected only once',
      })
    }
    if (mode === 'all' && employeeIds.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['assistanceScope', 'employeeIds'],
        message: 'All-agent assistance cannot also contain a selected-agent list',
      })
    }
    if (mode === 'all' && agentRates.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['assistanceScope', 'agentRates'],
        message: 'All-agent assistance uses the shared rate and cannot contain individual rates',
      })
    }
    if (mode === 'specific_agents' && employeeIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['assistanceScope', 'employeeIds'],
        message: 'Select at least one primary agent for ticket assistance',
      })
    }
    if (employeeIds.includes(profile.employeeId)) {
      context.addIssue({
        code: 'custom',
        path: ['assistanceScope', 'employeeIds'],
        message: 'The assistant cannot select themselves as the primary agent',
      })
    }
    const rateEmployeeIds = agentRates.map((rate) => rate.employeeId)
    if (new Set(rateEmployeeIds).size !== rateEmployeeIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['assistanceScope', 'agentRates'],
        message: 'Each primary agent can have only one assistance rate',
      })
    }
    if (
      mode === 'specific_agents' &&
      (rateEmployeeIds.length !== employeeIds.length ||
        rateEmployeeIds.some((employeeId) => !employeeIds.includes(employeeId)))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['assistanceScope', 'agentRates'],
        message: 'Enter an assistance rate for every selected primary agent',
      })
    }

    const bonusSteps =
      profile.monthlyBonus.steps.length > 0
        ? profile.monthlyBonus.steps
        : [
            {
              thresholdGbp: profile.monthlyBonus.thresholdGbp,
              rewardKind: profile.monthlyBonus.rewardKind,
              rewardValue: profile.monthlyBonus.rewardValue,
            },
          ]
    const thresholds = bonusSteps.map((step) => step.thresholdGbp)
    bonusSteps.forEach((step, index) => {
      if (step.rewardKind === 'percentage_of_qualifying_profit' && step.rewardValue > 100) {
        context.addIssue({
          code: 'custom',
          path: ['monthlyBonus', 'steps', index, 'rewardValue'],
          message: 'Percentage bonus rates cannot exceed 100%',
        })
      }
    })
    if (new Set(thresholds).size !== thresholds.length) {
      context.addIssue({
        code: 'custom',
        path: ['monthlyBonus', 'steps'],
        message: 'Each monthly profit target must be unique',
      })
    }
    if (profile.monthlyBonus.recurring.enabled && !profile.monthlyBonus.enabled) {
      context.addIssue({
        code: 'custom',
        path: ['monthlyBonus', 'recurring', 'enabled'],
        message: 'Enable the monthly profit bonus before adding a recurring bonus',
      })
    }
    if (profile.monthlyBonus.recurring.enabled) {
      const recurring = profile.monthlyBonus.recurring
      if (recurring.startsAtGbp <= Math.max(...thresholds)) {
        context.addIssue({
          code: 'custom',
          path: ['monthlyBonus', 'recurring', 'startsAtGbp'],
          message: 'The recurring bonus must start after the highest one-off target',
        })
      }
      if (
        recurring.rewardKind === 'percentage_of_qualifying_profit' &&
        recurring.rewardValue > 100
      ) {
        context.addIssue({
          code: 'custom',
          path: ['monthlyBonus', 'recurring', 'rewardValue'],
          message: 'Percentage bonus rates cannot exceed 100%',
        })
      }
    }
  })

export type CommissionProfileInput = z.infer<typeof commissionProfileSchema>
export type CommissionRate = z.infer<typeof commissionRateSchema>

export type CommissionPolicyComponentInput = {
  componentType:
    | 'explicit_zero'
    | 'fixed_per_unit'
    | 'fixed_per_event'
    | 'percentage_of_variable'
    | 'signed_percentage'
    | 'marginal_ticket_tier'
    | 'fixed_package'
    | 'fixed_package_per_passenger'
    | 'percentage_of_package_profit'
    | 'sales_profit_bonus'
  sourceVariable?: string
  recipientRole:
    | 'primary'
    | 'assistant'
    | 'low_fare_actor'
    | 'package_sales'
    | 'application_agent'
    | 'sales_bonus'
  rateValue?: number
  thresholdGbp?: number
  rewardKind?: 'fixed_gbp' | 'percentage_of_qualifying_profit'
  rewardValue?: number
  eligibleServices: Array<(typeof commissionServiceCodes)[number]>
  tiers?: Array<{ minUnit: number; rateGbp: number }>
  config: Record<string, unknown>
}

export type CommissionServicePolicyInput = {
  sourceModule: 'ticketing' | 'packages' | 'applications'
  serviceCode: CommissionProfileServiceCode | 'sales_bonus'
  recipientRole: CommissionPolicyComponentInput['recipientRole']
  components: CommissionPolicyComponentInput[]
}

export type StoredCommissionProfileConfiguration = {
  uiVersion: 6
  services: CommissionServicePolicyInput[]
  draft: CommissionProfileInput
}

const PROFILE_SERVICE_METADATA: Record<
  CommissionProfileServiceCode,
  {
    sourceModule: CommissionServicePolicyInput['sourceModule']
    recipientRole: CommissionServicePolicyInput['recipientRole']
    sourceVariable?: string
  }
> = {
  tk_primary: {
    sourceModule: 'ticketing',
    recipientRole: 'primary',
    sourceVariable: 'passenger_ticket_count',
  },
  tk_assistance: {
    sourceModule: 'ticketing',
    recipientRole: 'assistant',
    sourceVariable: 'passenger_ticket_count',
  },
  dc: {
    sourceModule: 'ticketing',
    recipientRole: 'primary',
    sourceVariable: 'passenger_ticket_count',
  },
  r_er: {
    sourceModule: 'ticketing',
    recipientRole: 'primary',
    sourceVariable: 'passenger_ticket_count',
  },
  low_fare: {
    sourceModule: 'ticketing',
    recipientRole: 'low_fare_actor',
    sourceVariable: 'difference_gbp',
  },
  higher_fare: {
    sourceModule: 'ticketing',
    recipientRole: 'low_fare_actor',
    sourceVariable: 'difference_gbp',
  },
  package_sale: {
    sourceModule: 'packages',
    recipientRole: 'package_sales',
    sourceVariable: 'package_profit_gbp',
  },
  application_nadra: {
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  application_nadra_urgent: {
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  application_passport_pk: {
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  application_passport_pk_urgent: {
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  application_passport_gb: {
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  application_visa: {
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
}

function componentForProfileRate(
  serviceCode: CommissionProfileServiceCode,
  rate: CommissionRate,
  assistanceScope: CommissionAssistanceScope,
  input: CommissionProfileInput,
): CommissionPolicyComponentInput {
  const metadata = PROFILE_SERVICE_METADATA[serviceCode]
  const common = {
    recipientRole: metadata.recipientRole,
    eligibleServices: [serviceCode],
    config: {
      serviceCode,
      payCurrency: rate.currency || input.compensation.currency,
      ...(serviceCode.startsWith('tk_') ||
      ['dc', 'r_er', 'low_fare', 'higher_fare'].includes(serviceCode)
        ? { ticketRefundTreatment: input.ticketRefundCommission.treatment }
        : {}),
      ...(serviceCode === 'tk_assistance' ? { assistanceScope } : {}),
      ...(serviceCode === 'tk_primary' && rate.kind === 'tiered'
        ? { includeDateChangesInMarginalTiers: input.ticketTierOptions.includeDateChanges }
        : {}),
      ...(serviceCode === 'package_sale' && rate.kind === 'tiered'
        ? { marginalUnit: 'package_passenger_band' }
        : {}),
    },
  }

  if (rate.kind === 'none') {
    return { ...common, componentType: 'explicit_zero', rateValue: 0 }
  }
  if (rate.kind === 'tiered') {
    return {
      ...common,
      componentType: 'marginal_ticket_tier',
      tiers: [...rate.tiers].sort((left, right) => left.minUnit - right.minUnit),
    }
  }
  if (serviceCode === 'package_sale') {
    if (rate.kind === 'per_event') {
      return { ...common, componentType: 'fixed_package', rateValue: rate.value }
    }
    if (rate.kind === 'per_unit') {
      return {
        ...common,
        componentType: 'fixed_package_per_passenger',
        sourceVariable: 'passenger_count',
        rateValue: rate.value,
      }
    }
    return {
      ...common,
      componentType: 'percentage_of_package_profit',
      sourceVariable: metadata.sourceVariable,
      rateValue: rate.value,
    }
  }
  if (rate.kind === 'per_event') {
    return { ...common, componentType: 'fixed_per_event', rateValue: rate.value }
  }
  if (rate.kind === 'percentage') {
    return {
      ...common,
      componentType: serviceCode === 'higher_fare' ? 'signed_percentage' : 'percentage_of_variable',
      sourceVariable:
        serviceCode === 'low_fare' || serviceCode === 'higher_fare'
          ? 'difference_gbp'
          : 'sale_price_gbp',
      rateValue: rate.value,
    }
  }
  if (rate.kind === 'full_difference') {
    return {
      ...common,
      componentType: 'signed_percentage',
      sourceVariable: 'difference_gbp',
      rateValue: 100,
    }
  }
  return {
    ...common,
    componentType: 'fixed_per_unit',
    sourceVariable: serviceCode === 'low_fare' ? 'passenger_ticket_count' : metadata.sourceVariable,
    rateValue: rate.value,
  }
}

export function toStoredCommissionProfile(
  input: CommissionProfileInput,
): StoredCommissionProfileConfiguration {
  const profileRates: Array<[CommissionProfileServiceCode, CommissionRate]> = [
    ['tk_primary', input.services.tkPrimary],
    ['tk_assistance', input.services.tkAssistance],
    ['dc', input.services.dateChange],
    ['r_er', input.services.reissue],
    ['low_fare', input.services.lowFare],
    ['higher_fare', input.services.higherFare],
    ['package_sale', input.services.packageSale],
    ['application_nadra', input.services.applicationNadra],
    ['application_nadra_urgent', input.services.applicationNadraUrgent],
    ['application_passport_pk', input.services.applicationPassportPk],
    ['application_passport_pk_urgent', input.services.applicationPassportPkUrgent],
    ['application_passport_gb', input.services.applicationPassportGb],
    ['application_visa', input.services.applicationVisa],
  ]
  const services: CommissionServicePolicyInput[] = profileRates.map(([serviceCode, rate]) => {
    const metadata = PROFILE_SERVICE_METADATA[serviceCode]
    return {
      sourceModule: metadata.sourceModule,
      serviceCode,
      recipientRole: metadata.recipientRole,
      components: [componentForProfileRate(serviceCode, rate, input.assistanceScope, input)],
    }
  })

  if (input.monthlyBonus.enabled) {
    const bonusSteps =
      input.monthlyBonus.steps.length > 0
        ? [...input.monthlyBonus.steps].sort(
            (left, right) => left.thresholdGbp - right.thresholdGbp,
          )
        : [
            {
              thresholdGbp: input.monthlyBonus.thresholdGbp,
              rewardKind: input.monthlyBonus.rewardKind,
              rewardValue: input.monthlyBonus.rewardValue,
            },
          ]
    const firstStep = bonusSteps[0]!
    services.push({
      sourceModule: 'ticketing',
      serviceCode: 'sales_bonus',
      recipientRole: 'sales_bonus',
      components: [
        {
          componentType: 'sales_profit_bonus',
          recipientRole: 'sales_bonus',
          thresholdGbp: firstStep.thresholdGbp,
          rewardKind: firstStep.rewardKind,
          rewardValue: firstStep.rewardValue,
          eligibleServices: input.monthlyBonus.eligibleServices,
          config: {
            period: 'calendar_month',
            basis: 'employee_contributed_profit',
            payCurrency: input.monthlyBonus.currency || input.compensation.currency,
            bonusScheduleVersion: 1,
            steps: bonusSteps,
            recurring: input.monthlyBonus.recurring,
          },
        },
      ],
    })
  }

  return { uiVersion: 6, services, draft: input }
}

export function createDefaultCommissionProfile(employeeId = ''): CommissionProfileInput {
  const now = new Date()
  const effectiveFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  const zeroRate: CommissionRate = { kind: 'none', value: 0, tiers: [], currency: null }

  return {
    employeeId,
    label: 'New commission plan',
    effectiveFrom,
    locationId: null,
    copiedFromProfileId: null,
    changeReason: 'Initial employee commission plan',
    services: {
      tkPrimary: { ...zeroRate },
      tkAssistance: { ...zeroRate },
      dateChange: { ...zeroRate },
      reissue: { ...zeroRate },
      lowFare: { ...zeroRate },
      higherFare: { ...zeroRate },
      packageSale: { ...zeroRate },
      applicationNadra: { ...zeroRate },
      applicationNadraUrgent: { ...zeroRate },
      applicationPassportPk: { ...zeroRate },
      applicationPassportPkUrgent: { ...zeroRate },
      applicationPassportGb: { ...zeroRate },
      applicationVisa: { ...zeroRate },
    },
    assistanceScope: { mode: 'all', employeeIds: [], agentRates: [] },
    applicationRouting: { mode: 'self', recipientEmployeeId: null },
    ticketTierOptions: { includeDateChanges: false },
    compensation: { currency: 'GBP', salaryCurrency: null, monthlySalary: 0 },
    ticketRefundCommission: { treatment: 'retain' },
    monthlyBonus: {
      enabled: false,
      thresholdGbp: 0,
      rewardKind: 'fixed_gbp',
      rewardValue: 0,
      currency: null,
      steps: [],
      recurring: {
        enabled: false,
        startsAtGbp: 0,
        intervalGbp: 1_000,
        rewardKind: 'fixed_gbp',
        rewardValue: 0,
        maxOccurrences: null,
      },
      eligibleServices: ['tk_primary'],
    },
  }
}

export function profileNeedsWholeMonths(profile: CommissionProfileInput) {
  return (
    profile.services.tkPrimary.kind === 'tiered' ||
    profile.monthlyBonus.enabled ||
    profile.compensation.currency !== 'GBP' ||
    (profile.compensation.salaryCurrency || profile.compensation.currency) !== 'GBP' ||
    Object.values(profile.services).some(
      (rate) => Boolean(rate.currency) && rate.currency !== 'GBP',
    ) ||
    profile.compensation.monthlySalary > 0
  )
}

import { z } from 'zod'

export const COMMISSION_CAPABILITY_VERSION = 2026082902

export const commissionSourceModules = ['ticketing', 'packages'] as const
export const commissionServiceCodes = [
  'tk_primary',
  'tk_assistance',
  'dc',
  'r_er',
  'low_fare',
  'higher_fare',
  'package_sale',
  'sales_bonus',
] as const
export const commissionRecipientRoles = [
  'primary',
  'assistant',
  'low_fare_actor',
  'package_sales',
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
    eligibleServices: z.array(z.enum(commissionServiceCodes)).max(8).default([]),
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

export const createCommissionAccessGrantSchema = z.object({ employeeId: uuidSchema }).strict()

export const commissionProcessSchema = z
  .object({ limit: z.number().int().min(1).max(200).default(50) })
  .strict()

export const commissionRetrySchema = z.object({}).strict()

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

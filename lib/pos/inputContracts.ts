import { z } from 'zod'

const money = z
  .number()
  .finite()
  .positive()
  .max(10_000_000)
  .refine(
    (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-8,
    'Use no more than two decimals',
  )

const nonNegativeMoney = z
  .number()
  .finite()
  .nonnegative()
  .max(10_000_000)
  .refine(
    (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-8,
    'Use no more than two decimals',
  )

export const posTenderSchema = z
  .object({
    method: z.enum(['CASH', 'CARD', 'BANK', 'OTHER']),
    amount: money,
    externalReference: z.string().trim().min(1).max(200).optional(),
    reconciliationStatus: z.enum(['RECORDED', 'PENDING', 'COMPLETED', 'FAILED']).optional(),
  })
  .strict()

export const posSourceSchema = z
  .object({
    type: z.enum(['LMS', 'TICKETING', 'APPLICATIONS', 'PACKAGES']),
    namespace: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .optional(),
    recordId: z.string().trim().min(1).max(200),
    displayReference: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export const posPostTransactionSchema = z
  .object({
    shiftId: z.string().uuid(),
    catalogueKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,63}$/),
    categoryKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,63}$/)
      .optional(),
    entryMode: z.enum(['CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT']).default('CUSTOMER_PAYMENT'),
    direction: z.enum(['IN', 'OUT']),
    outgoingType: z.enum(['REFUND', 'EXPENSE', 'SUPPLIER_PAYMENT']).optional(),
    totalAmount: money,
    customerName: z.string().trim().min(1).max(160).default('Walk-in'),
    customerPhone: z.string().trim().min(3).max(40).optional(),
    note: z.string().trim().min(3).max(2000).optional(),
    tenders: z.array(posTenderSchema).max(4),
    source: posSourceSchema.optional(),
    pricingId: z.string().uuid().optional(),
    pricingConfirmed: z.boolean().default(false),
    supplierId: z.string().uuid().optional(),
    supplierMovementType: z.enum(['DEPOSIT', 'USE_BALANCE', 'REFUND']).optional(),
    loyaltyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$/)
      .optional(),
    lms: z
      .object({ loanId: z.string().uuid(), paymentMethodId: z.string().uuid() })
      .strict()
      .optional(),
    confirmDuplicate: z.boolean().default(false),
  })
  .strict()

const verificationFields = {
  verificationCode: z.string().trim().min(1).max(100).optional(),
  verificationMethod: z.enum(['totp', 'backup', 'auto']).default('auto'),
}

export const posOpenShiftSchema = z
  .object({
    tillId: z.string().uuid(),
    openingFloat: nonNegativeMoney,
    overrideReason: z.string().trim().min(10).max(1000).optional(),
  })
  .strict()

const denominationSchema = z
  .object({
    valuePence: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(5),
      z.literal(10),
      z.literal(20),
      z.literal(50),
      z.literal(100),
      z.literal(200),
    ]),
    count: z.number().int().nonnegative().max(100_000),
  })
  .strict()

export const posCashMovementSchema = z
  .object({
    shiftId: z.string().uuid(),
    movementType: z.enum(['RESERVE_IN', 'RESERVE_OUT', 'DEPOSIT', 'WITHDRAWAL', 'CORRECTION']),
    direction: z.enum(['IN', 'OUT']).optional(),
    amount: money,
    denominations: z.array(denominationSchema).max(8).default([]),
    reason: z.string().trim().min(3).max(1000),
    ...verificationFields,
  })
  .strict()

export const posCloseShiftSchema = z
  .object({
    shiftId: z.string().uuid(),
    countedDrawer: nonNegativeMoney,
    countedReserve: nonNegativeMoney,
    drawerDenominations: z.array(denominationSchema).max(8).default([]),
    reserveDenominations: z.array(denominationSchema).max(8).default([]),
    reason: z.string().trim().min(10).max(1000).optional(),
  })
  .strict()

export const posApproveCloseoutSchema = z
  .object({
    closeoutId: z.string().uuid(),
    approvalNote: z.string().trim().min(3).max(1000).optional(),
    verificationCode: z.string().trim().min(1).max(100),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).default('auto'),
  })
  .strict()

export const posRefundSchema = z
  .object({
    shiftId: z.string().uuid(),
    refundKind: z.enum(['LINKED', 'GENERAL']),
    originalTransactionId: z.string().uuid().optional(),
    amount: money,
    tenders: z.array(posTenderSchema).min(1).max(4),
    reasonCode: z.string().trim().min(2).max(80),
    note: z.string().trim().min(3).max(2000),
    supportingReference: z.string().trim().min(1).max(200).optional(),
    originalEvidence: z
      .object({
        originalDate: z.string().date(),
        customerName: z.string().trim().min(1).max(160),
        service: z.string().trim().min(1).max(160),
        originalAmount: money,
        originalPaymentMethod: z.enum(['CASH', 'CARD', 'BANK', 'OTHER', 'UNKNOWN']),
      })
      .strict()
      .optional(),
    approvalReason: z.string().trim().min(10).max(1000).optional(),
    ...verificationFields,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.refundKind === 'LINKED' && !value.originalTransactionId) {
      context.addIssue({
        code: 'custom',
        path: ['originalTransactionId'],
        message: 'Original transaction required',
      })
    }
    if (value.refundKind === 'GENERAL' && !value.originalEvidence) {
      context.addIssue({
        code: 'custom',
        path: ['originalEvidence'],
        message: 'Original evidence required',
      })
    }
  })

export const posSupplierSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    alternateNames: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
    sourceArea: z.string().trim().min(1).max(80).optional(),
    sourceReference: z.string().trim().min(1).max(200).optional(),
    openingBalance: nonNegativeMoney.default(0),
    openingNote: z.string().trim().min(10).max(1000).optional(),
    ...verificationFields,
  })
  .strict()

const configurationKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/)
const configurationBase = {
  isActive: z.boolean().default(true),
}

export const posConfigurationMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('UPSERT_CATEGORY'),
      key: configurationKey,
      label: z.string().trim().min(1).max(100),
      description: z.string().trim().min(1).max(240).optional(),
      iconKey: configurationKey.default('sparkles'),
      displayOrder: z.number().int().min(0).max(10_000),
      supplierPaymentsEnabled: z.boolean().default(false),
      ...configurationBase,
    })
    .strict(),
  z
    .object({
      action: z.literal('UPSERT_SERVICE'),
      key: configurationKey,
      categoryKey: configurationKey,
      label: z.string().trim().min(1).max(100),
      classification: z.enum(['SERVICE', 'EXPENSE']).default('SERVICE'),
      direction: z.enum(['IN', 'OUT']),
      displayOrder: z.number().int().min(0).max(10_000),
      logoKey: z.enum(['ria', 'moneygram', 'western-union', 'dex', 'intercity']).optional(),
      loyaltyEligible: z.boolean().default(false),
      pointsPerGbp: z.number().finite().min(0).max(10_000).default(0),
      allowedPaymentMethods: z
        .array(z.enum(['CASH', 'CARD', 'BANK', 'OTHER']))
        .min(1)
        .max(4),
      customerRequired: z.boolean().default(false),
      noteRequired: z.boolean().default(false),
      priceRequired: z.boolean().default(false),
      sourceRequired: z.boolean().default(false),
      ...configurationBase,
    })
    .strict(),
  z
    .object({
      action: z.literal('UPSERT_SUPPLIER'),
      supplierId: z.string().uuid().optional(),
      name: z.string().trim().min(2).max(160),
      aliases: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
      sourceArea: z.string().trim().min(1).max(80).optional(),
      sourceReference: z.string().trim().min(1).max(200).optional(),
      ...configurationBase,
    })
    .strict(),
  z
    .object({
      action: z.literal('SET_ASSIGNMENT'),
      categoryKey: configurationKey,
      supplierId: z.string().uuid(),
      isDefault: z.boolean().default(false),
      ...configurationBase,
    })
    .strict(),
])

export const posCorrectionSchema = z
  .object({
    shiftId: z.string().uuid(),
    originalTransactionId: z.string().uuid(),
    reason: z.string().trim().min(10).max(2000),
    verificationCode: z.string().trim().min(1).max(100),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).default('auto'),
  })
  .strict()

export const posReconciliationSchema = z
  .object({
    transactionTenderId: z.string().uuid().optional(),
    refundTenderId: z.string().uuid().optional(),
    status: z.enum(['RECORDED', 'PENDING', 'COMPLETED', 'FAILED']),
    externalReference: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().min(3).max(1000).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.transactionTenderId) !== Boolean(value.refundTenderId), {
    message: 'Choose exactly one tender',
  })

export const posLegacyRowSchema = z
  .object({
    legacySource: z.string().trim().min(2).max(100),
    legacyRowKey: z.string().trim().min(1).max(200),
    businessDate: z.string().date(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    catalogueKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,63}$/),
    customerName: z.string().trim().min(1).max(160).default('Walk-in'),
    direction: z.enum(['IN', 'OUT']),
    outgoingType: z.enum(['REFUND', 'EXPENSE', 'SUPPLIER_PAYMENT']).optional(),
    amount: money,
    paymentMethod: z.enum(['CASH', 'CARD', 'BANK', 'OTHER']),
    note: z.string().trim().max(2000).optional(),
    externalReference: z.string().trim().min(1).max(200).optional(),
    originalReference: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export const posImportSchema = z
  .object({
    mode: z.enum(['DRY_RUN', 'COMMIT']),
    rows: z.array(posLegacyRowSchema).min(1).max(500),
    verificationCode: z.string().trim().min(1).max(100).optional(),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).default('auto'),
  })
  .strict()

export type PosPostTransactionInput = z.output<typeof posPostTransactionSchema>
export type PosRefundInput = z.output<typeof posRefundSchema>

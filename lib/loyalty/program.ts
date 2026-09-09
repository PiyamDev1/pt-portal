export type LoyaltyProgramPolicy = {
  name: string
  programYearStartsOn: string
  pointValidityMonths: number
  voucherValidityMonths: number
  earningRules: Array<{
    key: string
    label: string
    points: number
    unit: string
    isActive?: boolean
  }>
  voucherRewards: Array<{
    points: number
    valuePence: number
    validityMonths?: number
    isActive?: boolean
  }>
  bonusEventOptions: Array<{
    key: string
    label: string
    suggestedAward: string
    description: string
    defaultCustomerCap: number
  }>
  ranks: Array<{
    name: string
    minimumPoints: number
    maximumPoints: number | null
    maintenancePoints: number
  }>
  rankReview: {
    reviewMonths: number
    demotionSteps: number
    retainedBalanceLossNumerator: number
    retainedBalanceLossDenominator: number
    currentReviewPeriodPointsProtected: boolean
  }
  redemptionRules: {
    oneVoucherPerTransaction: boolean
    noCashValue: boolean
    noChangeOrRefundOnUnusedValue: boolean
    pointsDeductedWhenVoucherIssued: boolean
    expiredVouchersDoNotRestorePoints: boolean
  }
  exclusions: readonly string[]
  operationalNotes: readonly string[]
  rollout: {
    earningActive: boolean
    expiryActive: boolean
    voucherIssuanceActive: boolean
    voucherRedemptionActive: boolean
    rankReviewActive: boolean
  }
}

export const LOYALTY_PROGRAM_POLICY = {
  name: 'Piyam Loyalty Program',
  programYearStartsOn: '01 Jan',
  pointValidityMonths: 12,
  voucherValidityMonths: 6,
  earningRules: [
    {
      key: 'remittance',
      label: 'Remittance transaction',
      points: 25,
      unit: 'completed paid transaction',
    },
    {
      key: 'ticket',
      label: 'Flight ticket',
      points: 80,
      unit: 'issued and paid passenger ticket',
    },
    {
      key: 'package',
      label: 'Travel package',
      points: 120,
      unit: 'fully paid traveller',
    },
    {
      key: 'cargo',
      label: 'Cargo or delivery',
      points: 25,
      unit: 'completed paid transaction',
    },
    {
      key: 'application',
      label: 'Application service',
      points: 25,
      unit: 'completed paid application',
    },
    {
      key: 'document_assistance',
      label: 'Document assistance',
      points: 10,
      unit: 'completed paid transaction',
    },
  ],
  voucherRewards: [
    { points: 250, valuePence: 250 },
    { points: 500, valuePence: 500 },
    { points: 1_000, valuePence: 1_000 },
    { points: 2_000, valuePence: 2_000 },
    { points: 5_000, valuePence: 5_000 },
    { points: 10_000, valuePence: 12_000 },
  ],
  bonusEventOptions: [
    {
      key: 'double_points',
      label: 'Double points',
      suggestedAward: '2× base points',
      description: 'A date-limited event for selected services, branches or all eligible sales.',
      defaultCustomerCap: 500,
    },
    {
      key: 'fixed_bonus',
      label: 'Fixed campaign bonus',
      suggestedAward: '+50 points',
      description: 'A once-per-customer bonus after a selected qualifying transaction.',
      defaultCustomerCap: 50,
    },
    {
      key: 'welcome_bonus',
      label: 'Welcome bonus',
      suggestedAward: '+100 points',
      description: 'Awarded once after a new member completes their first qualifying paid service.',
      defaultCustomerCap: 100,
    },
    {
      key: 'referral_bonus',
      label: 'Verified referral',
      suggestedAward: '+150 / +100 points',
      description:
        '150 points to the referrer and 100 to the new member after the referred member completes a first qualifying purchase.',
      defaultCustomerCap: 750,
    },
    {
      key: 'off_peak_bonus',
      label: 'Off-peak or targeted bonus',
      suggestedAward: '+25 points',
      description: 'A branch, service or time-window incentive with a defined campaign budget.',
      defaultCustomerCap: 100,
    },
  ],
  ranks: [
    { name: 'Bronze', minimumPoints: 0, maximumPoints: 1_000, maintenancePoints: 0 },
    { name: 'Silver', minimumPoints: 1_001, maximumPoints: 5_000, maintenancePoints: 334 },
    { name: 'Gold', minimumPoints: 5_001, maximumPoints: 10_000, maintenancePoints: 1_667 },
    { name: 'Diamond', minimumPoints: 10_001, maximumPoints: null, maintenancePoints: 3_334 },
  ],
  rankReview: {
    reviewMonths: 12,
    demotionSteps: 1,
    retainedBalanceLossNumerator: 1,
    retainedBalanceLossDenominator: 3,
    currentReviewPeriodPointsProtected: true,
  },
  redemptionRules: {
    oneVoucherPerTransaction: true,
    noCashValue: true,
    noChangeOrRefundOnUnusedValue: true,
    pointsDeductedWhenVoucherIssued: true,
    expiredVouchersDoNotRestorePoints: true,
  },
  exclusions: [
    'Appointments and account actions',
    'Supplier payments, donations and unclassified income',
    'Cancelled, refunded, unpaid or invalid services',
    'Package-linked tickets already earning package points',
  ],
  operationalNotes: [
    'Points become available only after the qualifying service is paid and valid.',
    'Points are retained when a customer moves up a rank; promotion does not reset the balance.',
    'The rank review considers qualifying points earned during the preceding 12 months.',
    'A failed rank review drops one rank and removes one-third of still-valid points carried into the review period. Points earned during that period are not included in the penalty.',
    'Refunds and cancellations reverse their related points. A resulting negative balance must be cleared by future earnings before another voucher can be issued.',
    'Bonus events must have start and end times, eligible services or branches, a per-customer cap, a total campaign budget and a non-stacking rule unless an administrator explicitly allows stacking.',
  ],
  rollout: {
    earningActive: true,
    expiryActive: false,
    voucherIssuanceActive: false,
    voucherRedemptionActive: false,
    rankReviewActive: false,
  },
} as const satisfies LoyaltyProgramPolicy

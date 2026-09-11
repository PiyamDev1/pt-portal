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
  achievementRules: Array<{
    key: string
    name: string
    description: string
    requiredTransactions: number
    bonusPoints: number
    isActive?: boolean
  }>
  ranks: Array<{
    key: string
    name: string
    minimumPoints: number
    maximumPoints: number | null
    maintenancePoints: number
    colour: string
    walkInAllowance: number
    callbackPriority: number
    waitlistPriority: number
    perks: string[]
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
  voucherValidityMonths: 3,
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
    { points: 500, valuePence: 250 },
    { points: 1_000, valuePence: 500 },
    { points: 2_000, valuePence: 1_000 },
    { points: 5_000, valuePence: 2_500 },
    { points: 8_000, valuePence: 4_000 },
    { points: 12_000, valuePence: 6_000 },
    { points: 18_000, valuePence: 9_000 },
    { points: 24_000, valuePence: 12_000 },
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
    {
      key: 'birthday_gift',
      label: 'Birthday gift',
      suggestedAward: '+100 points',
      description:
        'Automatically awarded once during an active birthday campaign to opted-in members.',
      defaultCustomerCap: 100,
    },
    {
      key: 'eid_gift',
      label: 'Eid gift',
      suggestedAward: '+100 points',
      description:
        'Automatically awarded once to active members during the configured Eid campaign window.',
      defaultCustomerCap: 100,
    },
  ],
  achievementRules: [
    { key: 'first_ten', name: 'First Ten', description: 'Complete 10 paid and valid loyalty transactions.', requiredTransactions: 10, bonusPoints: 50 },
    { key: 'piyam_regular', name: 'Piyam Regular', description: 'Complete 25 paid and valid loyalty transactions.', requiredTransactions: 25, bonusPoints: 100 },
    { key: 'loyalty_champion', name: 'Loyalty Champion', description: 'Complete 50 paid and valid loyalty transactions.', requiredTransactions: 50, bonusPoints: 200 },
    { key: 'century_member', name: 'Century Member', description: 'Complete 100 paid and valid loyalty transactions.', requiredTransactions: 100, bonusPoints: 400 },
  ],
  ranks: [
    { key: 'bronze', name: 'Bronze', minimumPoints: 0, maximumPoints: 1_499, maintenancePoints: 0, colour: '#A16207', walkInAllowance: 0, callbackPriority: 0, waitlistPriority: 0, perks: ['Standard rewards', 'Bronze rank badge'] },
    { key: 'silver', name: 'Silver', minimumPoints: 1_500, maximumPoints: 3_999, maintenancePoints: 500, colour: '#64748B', walkInAllowance: 0, callbackPriority: 0, waitlistPriority: 0, perks: ['Member-only campaigns', 'Early programme announcements', 'Silver rank badge'] },
    { key: 'gold', name: 'Gold', minimumPoints: 4_000, maximumPoints: 7_999, maintenancePoints: 1_334, colour: '#CA8A04', walkInAllowance: 0, callbackPriority: 1, waitlistPriority: 0, perks: ['Member-only campaigns', 'Early programme announcements', 'Priority callback routing', 'Gold rank badge'] },
    { key: 'platinum', name: 'Platinum', minimumPoints: 8_000, maximumPoints: 14_999, maintenancePoints: 2_667, colour: '#475569', walkInAllowance: 0, callbackPriority: 2, waitlistPriority: 1, perks: ['Priority callback routing', 'Priority appointment waitlist', 'Platinum rank badge'] },
    { key: 'ruby', name: 'Ruby', minimumPoints: 15_000, maximumPoints: 24_999, maintenancePoints: 5_000, colour: '#9F1239', walkInAllowance: 2, callbackPriority: 3, waitlistPriority: 2, perks: ['Priority callback routing', 'Priority appointment waitlist', '2 NADRA or passport walk-ins per programme year', 'Ruby rank badge'] },
    { key: 'diamond', name: 'Diamond', minimumPoints: 25_000, maximumPoints: 39_999, maintenancePoints: 8_334, colour: '#0369A1', walkInAllowance: 4, callbackPriority: 4, waitlistPriority: 3, perks: ['Priority callback routing', 'Priority appointment waitlist', '4 NADRA or passport walk-ins per programme year', 'Diamond rank badge'] },
    { key: 'elite', name: 'Elite', minimumPoints: 40_000, maximumPoints: null, maintenancePoints: 13_334, colour: '#18181B', walkInAllowance: 8, callbackPriority: 5, waitlistPriority: 4, perks: ['Highest callback priority', 'Highest appointment waitlist priority', '8 NADRA or passport walk-ins per programme year', 'Elite rank badge'] },
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
    'The standard voucher exchange is 200 points per pound. New vouchers must be used within three months.',
    'Remittance transactions accept vouchers worth no more than £5.',
  ],
  rollout: {
    earningActive: true,
    expiryActive: false,
    voucherIssuanceActive: true,
    voucherRedemptionActive: true,
    rankReviewActive: false,
  },
} as const satisfies LoyaltyProgramPolicy

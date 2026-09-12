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
      points: 60,
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
      suggestedAward: '+50 points',
      description: 'Awarded once in a customer lifetime after verified account setup.',
      defaultCustomerCap: 50,
    },
    {
      key: 'referral_bonus',
      label: 'Verified referral',
      suggestedAward: '+100 / +50 points',
      description:
        '100 points to the referrer and 50 to the new member after verified account setup, with up to 10 outgoing referrals.',
      defaultCustomerCap: 1050,
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
      suggestedAward: '+50 points',
      description:
        'Automatically awarded once during an active birthday campaign to opted-in members.',
      defaultCustomerCap: 50,
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
    {
      key: 'first_step',
      name: 'First Step',
      description: 'Complete your first paid and valid loyalty transaction.',
      requiredTransactions: 1,
      bonusPoints: 5,
    },
    {
      key: 'travel_explorer',
      name: 'Travel Explorer',
      description: 'Complete 3 paid and valid loyalty transactions.',
      requiredTransactions: 3,
      bonusPoints: 5,
    },
    {
      key: 'high_five',
      name: 'High Five',
      description: 'Complete 5 paid and valid loyalty transactions.',
      requiredTransactions: 5,
      bonusPoints: 10,
    },
    {
      key: 'first_ten',
      name: 'First Ten',
      description: 'Complete 10 paid and valid loyalty transactions.',
      requiredTransactions: 10,
      bonusPoints: 50,
    },
    {
      key: 'taking_off',
      name: 'Taking Off',
      description: 'Complete 15 paid and valid loyalty transactions.',
      requiredTransactions: 15,
      bonusPoints: 10,
    },
    {
      key: 'travel_trail',
      name: 'Travel Trail',
      description: 'Complete 20 paid and valid loyalty transactions.',
      requiredTransactions: 20,
      bonusPoints: 15,
    },
    {
      key: 'piyam_regular',
      name: 'Piyam Regular',
      description: 'Complete 25 paid and valid loyalty transactions.',
      requiredTransactions: 25,
      bonusPoints: 100,
    },
    {
      key: 'journey_builder',
      name: 'Journey Builder',
      description: 'Complete 35 paid and valid loyalty transactions.',
      requiredTransactions: 35,
      bonusPoints: 25,
    },
    {
      key: 'loyalty_champion',
      name: 'Loyalty Champion',
      description: 'Complete 50 paid and valid loyalty transactions.',
      requiredTransactions: 50,
      bonusPoints: 200,
    },
    {
      key: 'seasoned_traveller',
      name: 'Seasoned Traveller',
      description: 'Complete 65 paid and valid loyalty transactions.',
      requiredTransactions: 65,
      bonusPoints: 40,
    },
    {
      key: 'frequent_flyer',
      name: 'Frequent Flyer',
      description: 'Complete 80 paid and valid loyalty transactions.',
      requiredTransactions: 80,
      bonusPoints: 50,
    },
    {
      key: 'century_member',
      name: 'Century Member',
      description: 'Complete 100 paid and valid loyalty transactions.',
      requiredTransactions: 100,
      bonusPoints: 400,
    },
    {
      key: 'route_runner',
      name: 'Route Runner',
      description: 'Complete 125 paid and valid loyalty transactions.',
      requiredTransactions: 125,
      bonusPoints: 75,
    },
    {
      key: 'globe_hopper',
      name: 'Globe Hopper',
      description: 'Complete 150 paid and valid loyalty transactions.',
      requiredTransactions: 150,
      bonusPoints: 100,
    },
    {
      key: 'passport_pro',
      name: 'Passport Pro',
      description: 'Complete 175 paid and valid loyalty transactions.',
      requiredTransactions: 175,
      bonusPoints: 125,
    },
    {
      key: 'journey_master',
      name: 'Journey Master',
      description: 'Complete 200 paid and valid loyalty transactions.',
      requiredTransactions: 200,
      bonusPoints: 150,
    },
    {
      key: 'silver_voyage',
      name: 'Silver Voyage',
      description: 'Complete 250 paid and valid loyalty transactions.',
      requiredTransactions: 250,
      bonusPoints: 175,
    },
    {
      key: 'boarding_club',
      name: 'Boarding Club',
      description: 'Complete 300 paid and valid loyalty transactions.',
      requiredTransactions: 300,
      bonusPoints: 200,
    },
    {
      key: 'horizon_seeker',
      name: 'Horizon Seeker',
      description: 'Complete 400 paid and valid loyalty transactions.',
      requiredTransactions: 400,
      bonusPoints: 250,
    },
    {
      key: 'five_hundred',
      name: 'Five Hundred',
      description: 'Complete 500 paid and valid loyalty transactions.',
      requiredTransactions: 500,
      bonusPoints: 300,
    },
    {
      key: 'atlas_adventurer',
      name: 'Atlas Adventurer',
      description: 'Complete 650 paid and valid loyalty transactions.',
      requiredTransactions: 650,
      bonusPoints: 350,
    },
    {
      key: 'world_wanderer',
      name: 'World Wanderer',
      description: 'Complete 800 paid and valid loyalty transactions.',
      requiredTransactions: 800,
      bonusPoints: 400,
    },
    {
      key: 'thousand_club',
      name: 'Thousand Club',
      description: 'Complete 1,000 paid and valid loyalty transactions.',
      requiredTransactions: 1000,
      bonusPoints: 500,
    },
    {
      key: 'trailblazer',
      name: 'Trailblazer',
      description: 'Complete 1,250 paid and valid loyalty transactions.',
      requiredTransactions: 1250,
      bonusPoints: 600,
    },
    {
      key: 'legacy_traveller',
      name: 'Legacy Traveller',
      description: 'Complete 1,500 paid and valid loyalty transactions.',
      requiredTransactions: 1500,
      bonusPoints: 750,
    },
    {
      key: 'globe_guardian',
      name: 'Globe Guardian',
      description: 'Complete 1,750 paid and valid loyalty transactions.',
      requiredTransactions: 1750,
      bonusPoints: 850,
    },
    {
      key: 'piyam_icon',
      name: 'Piyam Icon',
      description: 'Complete 2,000 paid and valid loyalty transactions.',
      requiredTransactions: 2000,
      bonusPoints: 1000,
    },
    {
      key: 'royal_voyager',
      name: 'Royal Voyager',
      description: 'Complete 2,500 paid and valid loyalty transactions.',
      requiredTransactions: 2500,
      bonusPoints: 1250,
    },
    {
      key: 'grand_explorer',
      name: 'Grand Explorer',
      description: 'Complete 3,000 paid and valid loyalty transactions.',
      requiredTransactions: 3000,
      bonusPoints: 1500,
    },
    {
      key: 'lifetime_legend',
      name: 'Lifetime Legend',
      description: 'Complete 5,000 paid and valid loyalty transactions.',
      requiredTransactions: 5000,
      bonusPoints: 2500,
    },
  ],
  ranks: [
    {
      key: 'bronze',
      name: 'Bronze',
      minimumPoints: 0,
      maximumPoints: 1_499,
      maintenancePoints: 0,
      colour: '#A16207',
      walkInAllowance: 0,
      callbackPriority: 0,
      waitlistPriority: 0,
      perks: ['Standard rewards', 'Bronze rank badge'],
    },
    {
      key: 'silver',
      name: 'Silver',
      minimumPoints: 1_500,
      maximumPoints: 3_999,
      maintenancePoints: 500,
      colour: '#64748B',
      walkInAllowance: 0,
      callbackPriority: 0,
      waitlistPriority: 0,
      perks: ['Member-only campaigns', 'Early programme announcements', 'Silver rank badge'],
    },
    {
      key: 'gold',
      name: 'Gold',
      minimumPoints: 4_000,
      maximumPoints: 7_999,
      maintenancePoints: 1_334,
      colour: '#CA8A04',
      walkInAllowance: 0,
      callbackPriority: 1,
      waitlistPriority: 0,
      perks: [
        'Member-only campaigns',
        'Early programme announcements',
        'Priority callback routing',
        'Gold rank badge',
      ],
    },
    {
      key: 'platinum',
      name: 'Platinum',
      minimumPoints: 8_000,
      maximumPoints: 14_999,
      maintenancePoints: 2_667,
      colour: '#475569',
      walkInAllowance: 0,
      callbackPriority: 2,
      waitlistPriority: 1,
      perks: ['Priority callback routing', 'Priority appointment waitlist', 'Platinum rank badge'],
    },
    {
      key: 'ruby',
      name: 'Ruby',
      minimumPoints: 15_000,
      maximumPoints: 24_999,
      maintenancePoints: 5_000,
      colour: '#9F1239',
      walkInAllowance: 2,
      callbackPriority: 3,
      waitlistPriority: 2,
      perks: [
        'Priority callback routing',
        'Priority appointment waitlist',
        '2 NADRA or passport walk-ins per programme year',
        'Ruby rank badge',
      ],
    },
    {
      key: 'diamond',
      name: 'Diamond',
      minimumPoints: 25_000,
      maximumPoints: 39_999,
      maintenancePoints: 8_334,
      colour: '#0369A1',
      walkInAllowance: 4,
      callbackPriority: 4,
      waitlistPriority: 3,
      perks: [
        'Priority callback routing',
        'Priority appointment waitlist',
        '4 NADRA or passport walk-ins per programme year',
        'Diamond rank badge',
      ],
    },
    {
      key: 'elite',
      name: 'Kryptonite',
      minimumPoints: 40_000,
      maximumPoints: null,
      maintenancePoints: 13_334,
      colour: '#16A34A',
      walkInAllowance: 8,
      callbackPriority: 5,
      waitlistPriority: 4,
      perks: [
        'Highest callback priority',
        'Highest appointment waitlist priority',
        '8 NADRA or passport walk-ins per programme year',
        'Kryptonite rank badge',
      ],
    },
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

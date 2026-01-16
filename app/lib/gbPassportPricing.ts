export type AgeGroup = 'Adult' | 'Child';
export type PageCount = '34' | '54';
export type ServiceType = 'Standard' | 'Fast Track 1wk' | 'Premium 1D';

interface PricingTier {
  cost: number;
  price: number;
}

// Pricing Rules defined by you
const PRICING_DB: Record<string, PricingTier> = {
  // CHILD
  'Child_34_Standard':       { cost: 61.50, price: 95.00 },
  'Child_54_Standard':       { cost: 74.50, price: 110.00 },
  'Child_34_Fast Track 1wk': { cost: 145.50, price: 180.00 },
  'Child_54_Fast Track 1wk': { cost: 158.50, price: 210.00 },
  
  // ADULT
  'Adult_34_Standard':       { cost: 94.50, price: 135.00 },
  'Adult_54_Standard':       { cost: 107.50, price: 150.00 },
  'Adult_34_Fast Track 1wk': { cost: 178.50, price: 225.00 },
  'Adult_54_Fast Track 1wk': { cost: 191.50, price: 250.00 },
  'Adult_34_Premium 1D':     { cost: 222.50, price: 275.00 },
  'Adult_54_Premium 1D':     { cost: 235.50, price: 295.00 },
};

export const getGbPassportPrice = (age: AgeGroup, pages: PageCount, service: ServiceType) => {
  const key = `${age}_${pages}_${service}`;
  return PRICING_DB[key] || { cost: 0, price: 0 };
};

export const GB_SERVICE_TYPES: ServiceType[] = ['Standard', 'Fast Track 1wk', 'Premium 1D'];

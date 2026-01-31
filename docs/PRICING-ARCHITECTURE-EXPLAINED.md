# Database Architecture Summary

## Current State vs. Target State

### Current State (Text-based, No Lookup Tables)
```
❌ Old Structure:
nadra_pricing table (text columns)
├── service_type: "NICOP/CNIC" (text - duplicated many times)
├── service_option: "Normal" (text - duplicated many times)
└── No foreign keys = data inconsistency risk

Problem:
- If you want to rename "Executive" to "Urgent", you have to update multiple places
- No validation that service_type is valid
- Impossible to maintain a master list of all valid services
```

### Target State (Lookup Tables with FK Relationships)
```
✅ New Structure (Following GB Passport Pattern):

nadra_service_types (Master Registry)
├── id: uuid-1, name: "NICOP/CNIC"
├── id: uuid-2, name: "POC"
├── id: uuid-3, name: "FRC"
└── ...

nadra_service_options (Options per Type)
├── id: uuid-10, service_type_id: uuid-1, name: "Normal"
├── id: uuid-11, service_type_id: uuid-1, name: "Executive"
├── id: uuid-12, service_type_id: uuid-1, name: "Cancellation"
└── ...

nadra_pricing (Links Services to Prices)
├── id: uuid-100, service_type_id: uuid-1, service_option_id: uuid-10, cost: 100, price: 150
├── id: uuid-101, service_type_id: uuid-1, service_option_id: uuid-11, cost: 200, price: 300
└── ...

Benefits:
✅ Single definition of each service
✅ Foreign keys ensure data integrity
✅ Easy to rename a service (one place)
✅ Impossible to have invalid service references
✅ Can query all services with pricing via JOINs
```

## Data Flow Comparison

### Adding NICOP/CNIC Executive Service with Pricing

**Old Approach:**
```
Admin enters text values in form:
- Service Type: "NICOP/CNIC"
- Service Option: "Executive"
- Cost: 200
- Price: 300
↓
Inserted into nadra_pricing as TEXT
↓
All later queries use these text values
↓
❌ If user mistyped "Exucutive", system accepts it
```

**New Approach:**
```
Admin selects from lookup table:
- Service Type: [Dropdown showing: NICOP/CNIC, POC, FRC, CRC]
- Service Option: [Dropdown showing only options for selected type]
- Cost: 200
- Price: 300
↓
Inserted into nadra_pricing with UUID references
↓
All later queries JOIN with lookup tables
↓
✅ System only shows valid options
✅ Data is consistent and validated
```

## Service Hierarchy (NADRA Example)

```
NADRA Services Structure:

NICOP/CNIC
├── Normal (Processing time: 15 days, Cost: 100, Price: 150)
├── Executive (Processing time: 5 days, Cost: 200, Price: 300)
├── Upgrade to Fast (Cost: 50, Price: 75)
├── Modification (Cost: 75, Price: 100)
├── Reprint (Cost: 50, Price: 75)
└── Cancellation (Cost: 0, Price: 0)

POC
├── (No options - single service)

FRC
├── (Can add options here)

CRC
├── (Can add options here)
```

## Pakistani Passport Structure

```
Category × Speed × Application Type = Pricing

Categories:
├── Child 5 Year
└── Adult 10 Year

Speeds:
├── Executive
└── Normal

Application Types:
├── First Time
└── Renewal

Pricing Matrix:
Child 5 Year × Executive × First Time = Cost: 300, Price: 450
Child 5 Year × Executive × Renewal   = Cost: 250, Price: 375
Child 5 Year × Normal × First Time   = Cost: 200, Price: 300
Child 5 Year × Normal × Renewal      = Cost: 150, Price: 225
Adult 10 Year × Executive × First Time = Cost: 400, Price: 600
Adult 10 Year × Executive × Renewal   = Cost: 350, Price: 525
Adult 10 Year × Normal × First Time   = Cost: 300, Price: 450
Adult 10 Year × Normal × Renewal      = Cost: 250, Price: 375
```

## How Application Forms Will Use This

### Current Flow (Before Pricing)
```
Application Form (Nadra)
    ↓
User selects from hardcoded dropdown:
  - Service Type: [NICOP/CNIC, POC, FRC, CRC]
  - Service Option: [Normal, Executive, ...]
    ↓
Submitted to API
    ↓
Stored in nadra_services + nicop_cnic_details
```

### New Flow (With Pricing)
```
Application Form (Nadra) - Page Load
    ↓ (useEffect)
Fetch /api/nadra/metadata
    ↓ (API returns)
{
  serviceTypes: [{id, name}, ...],
  serviceOptions: [{id, name, service_type_id}, ...],
  pricing: [{id, cost, price, serviceType, serviceOption}, ...]
}
    ↓
State: { serviceTypes, serviceOptions, pricing }
    ↓
Render Service Type Dropdown (from serviceTypes)
    ↓
User selects "NICOP/CNIC"
    ↓
Filter serviceOptions by service_type_id
    ↓
Render Service Option Dropdown (filtered)
    ↓
User selects "Executive"
    ↓
Find pricing: { cost: 200, price: 300 }
    ↓
Display: "Agency Price: £300 (Cost: £200, Margin: £100)"
    ↓
User submits
    ↓
Stored as before + system knows the pricing
```

## Key Files Created

### SQL Migration
`/scripts/create-service-lookup-tables.sql`
- Creates all lookup tables
- Creates refactored pricing tables with FK
- Inserts default NADRA and Pakistani Passport services
- Sets up indexes and RLS policies

### API Endpoints
`/app/api/nadra/metadata/route.js`
- Returns serviceTypes, serviceOptions, pricing

`/app/api/passports/pak/metadata/route.js`
- Returns categories, speeds, applicationTypes, pricing

### Documentation
`/docs/SERVICE-PRICING-ARCHITECTURE.md`
- Full architecture guide with examples

`/docs/UPDATED-SCHEMA-REFERENCE.md`
- Complete schema for your reference

## What's Changed?

### Tables Affected

1. **NEW Tables:**
   - `nadra_service_types`
   - `nadra_service_options`
   - `pk_passport_categories`
   - `pk_passport_speeds`
   - `pk_passport_application_types`

2. **REFACTORED Tables:**
   - `nadra_pricing` (now uses FK to lookup tables)
   - `pk_passport_pricing` (now uses FK to lookup tables)

3. **UNCHANGED Tables:**
   - `nadra_services` (still stores text values, but API validates them)
   - `nicop_cnic_details` (still stores text options)
   - `pakistani_passport_applications` (still stores text values)
   - `british_passport_applications` (already uses FK pattern)

### Why Application Tables Stay Unchanged

The application tables (`nadra_services`, `pakistani_passport_applications`) still store TEXT values for:
- Flexibility (can accept data even if lookup table doesn't have it yet)
- Backwards compatibility
- Historical record integrity

BUT the lookup tables become the SOURCE OF TRUTH for:
- What services are available
- What options can be selected
- What pricing applies

## Backward Compatibility

✅ **No Breaking Changes**
- Existing application data continues to work
- Forms still accept the same text values
- Lookups are NEW, not replacing existing data
- API endpoints are NEW additions

## Next Steps After SQL Migration

1. Update ServicePricingTab component to:
   - Populate service type dropdown from `nadra_service_types`
   - Allow adding new options to `nadra_service_options`
   - Link pricing via lookups

2. Update application forms to:
   - Fetch metadata from new API endpoints
   - Show dropdowns from lookup tables
   - Display pricing in real-time

3. Test pricing flow end-to-end

4. Enable pricing in background systems:
   - Commission calculations
   - Financial reports
   - Analytics dashboards

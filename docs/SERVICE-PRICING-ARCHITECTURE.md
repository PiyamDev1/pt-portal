# Service Pricing System - Complete Architecture Guide

## Overview

The pricing system now follows a **lookup table + pricing matrix** architecture (matching the GB Passport pattern). This ensures:

1. **Single source of truth** - Services are defined in lookup tables
2. **Referential integrity** - Pricing references lookup tables via foreign keys
3. **Scalability** - Easy to add new services without code changes
4. **Background execution** - Pricing can be used for commission calculations, reports, etc.

## Architecture Pattern

### GB Passport (Reference Pattern - Already Implemented)
```
Lookup Tables:              Pricing Table:
- gb_passport_ages    ──┐
- gb_passport_pages   ├─→ gb_passport_pricing ──→ british_passport_applications
- gb_passport_services└┘
```

### NADRA (New Implementation)
```
Lookup Tables:              Pricing Table:
- nadra_service_types    ┐
- nadra_service_options  ├─→ nadra_pricing ──→ nadra_services
```

### Pakistani Passport (New Implementation)
```
Lookup Tables:                      Pricing Table:
- pk_passport_categories          ┐
- pk_passport_speeds              ├─→ pk_passport_pricing ──→ pakistani_passport_applications
- pk_passport_application_types   ┘
```

## Database Tables

### NADRA Service Tables

1. **nadra_service_types** (Master list of service types)
   - id, name, description, is_active, created_at
   - Examples: NICOP/CNIC, POC, FRC, CRC, POA, etc.

2. **nadra_service_options** (Service options per type)
   - id, service_type_id, name, description, is_active, created_at
   - Examples for NICOP/CNIC: Normal, Executive, Cancellation, etc.

3. **nadra_pricing** (Pricing linked to lookup tables)
   - id, service_type_id (FK), service_option_id (FK), cost_price, sale_price, is_active, notes
   - Unique constraint: (service_type_id, service_option_id)

### Pakistani Passport Service Tables

1. **pk_passport_categories**
   - Child 5 Year, Adult 10 Year

2. **pk_passport_speeds**
   - Executive, Normal

3. **pk_passport_application_types**
   - First Time, Renewal

4. **pk_passport_pricing**
   - Combines all three dimensions with pricing
   - Unique constraint: (category_id, speed_id, application_type_id)

## Implementation Steps

### Step 1: Run the SQL Migration
Execute the SQL file in Supabase SQL Editor:
```
/scripts/create-service-lookup-tables.sql
```

This will:
- Create all lookup tables
- Create refactored pricing tables with FK relationships
- Insert default values for NADRA and Pakistani Passport services
- Set up indexes and RLS policies

### Step 2: Service Pricing Management UI
The ServicePricingTab component now:
- Shows lookup tables (not application data)
- Allows managing service options
- Links services to pricing directly
- Displays all available combinations

### Step 3: Application Forms Use Pricing
When users create applications:
- Forms fetch metadata from API endpoints
- Display dropdown options from lookup tables
- Calculate pricing in real-time

### Step 4: Background Processing
The pricing data becomes available for:
- Commission calculations
- Financial reports
- Analytics and dashboards
- Automated workflows

## API Endpoints

### NADRA Metadata
`GET /api/nadra/metadata`
```json
{
  "serviceTypes": [
    { "id": "uuid", "name": "NICOP/CNIC" },
    { "id": "uuid", "name": "POC" }
  ],
  "serviceOptions": [
    { "id": "uuid", "name": "Normal", "service_type_id": "uuid" },
    { "id": "uuid", "name": "Executive", "service_type_id": "uuid" }
  ],
  "pricing": [
    { "id": "uuid", "cost": 100, "price": 150, "serviceType": "NICOP/CNIC", "serviceOption": "Normal" }
  ]
}
```

### Pakistani Passport Metadata
`GET /api/passports/pak/metadata`
```json
{
  "categories": [
    { "id": "uuid", "name": "Child 5 Year" },
    { "id": "uuid", "name": "Adult 10 Year" }
  ],
  "speeds": [
    { "id": "uuid", "name": "Executive" },
    { "id": "uuid", "name": "Normal" }
  ],
  "applicationTypes": [
    { "id": "uuid", "name": "First Time" },
    { "id": "uuid", "name": "Renewal" }
  ],
  "pricing": [
    { "id": "uuid", "cost": 200, "price": 300, "category": "Adult 10 Year", "speed": "Executive", "applicationType": "First Time" }
  ]
}
```

## Key Differences from Previous Approach

### Old Approach (Text-based)
```
nadra_pricing table stored raw text:
- service_type: "NICOP/CNIC" (text)
- service_option: "Normal" (text)
- No foreign keys
- Duplicate data possible
- Hard to maintain consistency
```

### New Approach (Lookup-based) ✅
```
nadra_pricing table references lookups:
- service_type_id: UUID → nadra_service_types
- service_option_id: UUID → nadra_service_options
- Foreign keys enforce integrity
- Single definition of each option
- Scalable and maintainable
```

## Managing Services

### Add a New NADRA Service Type
1. Go to Service Pricing tab
2. Click "Add Service Type"
3. Enter name and description
4. System auto-inserts into lookup table

### Add a Service Option
1. Select service type
2. Enter option name and cost/price
3. System links it to the service type

### Add Pricing
1. Select service type and option
2. Enter cost and sale prices
3. Mark as active
4. Saved to pricing table with FK references

## Benefits

1. **Data Integrity** - Foreign keys prevent orphaned records
2. **Single Source of Truth** - Lookup tables are the master registry
3. **Easy Maintenance** - Add services without code changes
4. **Real-time Updates** - Pricing changes reflect immediately
5. **Background Processing** - Pricing data available for all systems
6. **Scalability** - Supports unlimited service combinations

## Migration Path for Existing Data

If you have existing text-based pricing data:

```sql
-- Migrate NADRA pricing from old table to new structure
INSERT INTO nadra_pricing (service_type_id, service_option_id, cost_price, sale_price, is_active)
SELECT 
  st.id,
  so.id,
  op.cost_price,
  op.sale_price,
  op.is_active
FROM old_nadra_pricing op
JOIN nadra_service_types st ON st.name = op.service_type
LEFT JOIN nadra_service_options so ON so.name = op.service_option AND so.service_type_id = st.id
```

## Next Steps

1. ✅ Run migration SQL
2. ⏳ Update ServicePricingTab component (in progress)
3. ⏳ Update application forms to load metadata
4. ⏳ Test end-to-end pricing flow
5. ⏳ Implement pricing in background systems (commissions, reports)

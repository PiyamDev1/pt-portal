# Service Tables Relationship Map

## Current Architecture (After Implementation)

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOOKUP TABLES (Master Registry)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ NADRA SERVICES:                                                   │
│                                                                   │
│ nadra_service_types         nadra_service_options                 │
│ ┌──────────────────┐        ┌──────────────────┐                 │
│ │ id               │        │ id               │                 │
│ │ name             │◄───┬───┤ service_type_id  │                 │
│ │ description      │    │   │ name             │                 │
│ │ is_active        │    │   │ description      │                 │
│ │ created_at       │    │   │ is_active        │                 │
│ └──────────────────┘    │   │ created_at       │                 │
│       ▲                 │   └──────────────────┘                 │
│       │                 │                                        │
│       │ FK              │                                        │
│       └─────────────────┘                                        │
│                                                                   │
│                                                                   │
│ PAKISTANI PASSPORT SERVICES:                                      │
│                                                                   │
│ pk_passport_categories  pk_passport_speeds  pk_passport_app_types│
│ ┌──────────────┐        ┌──────────────┐     ┌──────────────┐   │
│ │ id           │        │ id           │     │ id           │   │
│ │ name         │        │ name         │     │ name         │   │
│ │ description  │        │ description  │     │ description  │   │
│ │ is_active    │        │ is_active    │     │ is_active    │   │
│ │ created_at   │        │ created_at   │     │ created_at   │   │
│ └──────────────┘        └──────────────┘     └──────────────┘   │
│       ▲                        ▲                    ▲             │
│       │ FK                     │ FK                 │ FK          │
│       └────────────┬───────────┴────────────┬──────┘             │
│                    │                        │                    │
└────────────────────┼────────────────────────┼────────────────────┘
                     │                        │
┌────────────────────┼────────────────────────┼────────────────────┐
│                    │    PRICING TABLES      │                    │
├────────────────────┼────────────────────────┼────────────────────┤
│                    │                        │                    │
│                    ▼                        │                    │
│            nadra_pricing                    │                    │
│         ┌──────────────────┐                │                    │
│         │ id               │                │                    │
│         │ service_type_id  │◄───────────────┤                    │
│         │ service_option_id│◄────────┐      │                    │
│         │ cost_price       │         │      │                    │
│         │ sale_price       │         │      │                    │
│         │ is_active        │         │      │                    │
│         │ notes            │         │      │                    │
│         │ created_at       │         │      │                    │
│         │ updated_at       │         │      │                    │
│         └──────────────────┘         │      │                    │
│                                      │      │                    │
│                                      │      ▼                    │
│                            pk_passport_pricing                    │
│                         ┌──────────────────────┐                 │
│                         │ id                   │                 │
│                         │ category_id          │◄────────────────┤
│                         │ speed_id             │◄────────────────┤
│                         │ application_type_id  │◄────────────────┤
│                         │ cost_price           │                 │
│                         │ sale_price           │                 │
│                         │ is_active            │                 │
│                         │ notes                │                 │
│                         │ created_at           │                 │
│                         │ updated_at           │                 │
│                         └──────────────────────┘                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Can be JOINed with
                              │
┌─────────────────────────────────────────────────────────────────┐
│                   APPLICATION TABLES (Instances)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ nadra_services (still stores TEXT for flexibility)               │
│ ┌─────────────────────────────┐     nicop_cnic_details           │
│ │ id                          │     ┌─────────────────────────┐  │
│ │ applicant_id                │     │ id  (FK to nadra_...)   │  │
│ │ employee_id                 │     │ service_option (TEXT)   │  │
│ │ service_type (TEXT) ─────┐  │     └─────────────────────────┘  │
│ │ application_date        │  │                                    │
│ │ tracking_number         │  │─→ Should match nadra_service_types │
│ │ status                  │  │   (but stored as text for flex)   │
│ │ created_at              │  │                                    │
│ │ application_pin         │  │   service_option should match      │
│ │ application_id          │  │   nadra_service_options.name       │
│ └─────────────────────────────┘                                  │
│                                                                   │
│ pakistani_passport_applications                                  │
│ ┌──────────────────────────────┐                                │
│ │ id                           │                                │
│ │ applicant_id                 │                                │
│ │ employee_id                  │                                │
│ │ application_date             │                                │
│ │ category (TEXT) ─────┐       │                                │
│ │ speed (TEXT)      ───┼─→ Should match lookup table values     │
│ │ application_type (TEXT) ──┐  │   (but stored as text)         │
│ │ status                 │   │  │                                │
│ │ created_at             │   │  │                                │
│ │ ... other fields       │   │  │                                │
│ └──────────────────────────────┘                                │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### NADRA: Adding NICOP/CNIC Executive to Pricing

```
1. Admin goes to Service Pricing Tab
2. Selects Service Type: "NICOP/CNIC"
   → Queries nadra_service_types
   → Finds id: uuid-1 (for NICOP/CNIC)

3. Selects Service Option: "Executive"
   → Queries nadra_service_options WHERE service_type_id = uuid-1
   → Finds id: uuid-11 (for Executive)

4. Enters Cost: 200, Price: 300

5. Clicks Save
   → INSERT into nadra_pricing:
     {
       service_type_id: uuid-1,
       service_option_id: uuid-11,
       cost_price: 200,
       sale_price: 300,
       is_active: true
     }

6. Later, when application form loads:
   → Queries nadra_pricing with JOINs
   → Returns: {
       servicetype: "NICOP/CNIC",
       serviceoption: "Executive",
       cost: 200,
       price: 300
     }
```

### Pakistani Passport: Querying All Adult 10-Year Pricing

```
Query:
  SELECT np.*, pc.name as category, ps.name as speed, pat.name as app_type
  FROM pk_passport_pricing np
  JOIN pk_passport_categories pc ON np.category_id = pc.id
  JOIN pk_passport_speeds ps ON np.speed_id = ps.id
  JOIN pk_passport_application_types pat ON np.application_type_id = pat.id
  WHERE pc.name = 'Adult 10 Year'
  AND ps.name = 'Executive'

Result:
  ┌─────────────────────────────────────────────────┐
  │ category        │ speed      │ app_type  │ price │
  ├─────────────────────────────────────────────────┤
  │ Adult 10 Year   │ Executive  │ First Time│ 600   │
  │ Adult 10 Year   │ Executive  │ Renewal   │ 525   │
  └─────────────────────────────────────────────────┘
```

## How Application Forms Load Dropdowns

### Current (Before) - Hardcoded
```javascript
// NADRA Form
const serviceOptions = ['Normal', 'Executive', 'Cancellation', 'Modification', 'Reprint'];
```

### New (After) - Dynamic from Lookup
```javascript
// NADRA Form
useEffect(() => {
  // On page load, fetch metadata
  fetch('/api/nadra/metadata')
    .then(res => res.json())
    .then(data => {
      setServiceTypes(data.serviceTypes);  // [{ id, name }, ...]
      setServiceOptions(data.serviceOptions);  // [{ id, name, service_type_id }, ...]
      setPricing(data.pricing);  // [{ id, cost, price, serviceType, serviceOption }, ...]
    });
}, []);

// Render
<select value={selectedType} onChange={handleTypeChange}>
  {serviceTypes.map(t => <option key={t.id}>{t.name}</option>)}
</select>

<select value={selectedOption} onChange={handleOptionChange}>
  {serviceOptions
    .filter(o => o.service_type_id === getServiceTypeId(selectedType))
    .map(o => <option key={o.id}>{o.name}</option>)
  }
</select>

// Display pricing
const pricing = findPricing(selectedType, selectedOption);
<p>Agency Price: £{pricing.price} (Cost: £{pricing.cost})</p>
```

## Table Relationships Summary

### NADRA
```
nadra_service_types ──┐
                      ├─ nadra_pricing ──→ Used by: nadra_services
nadra_service_options ┘
```

### Pakistani Passport
```
pk_passport_categories ────┐
pk_passport_speeds         ├─ pk_passport_pricing ──→ Used by: pakistani_passport_applications
pk_passport_application_types ┘
```

### GB Passport (Already Implemented)
```
gb_passport_ages ──┐
gb_passport_pages  ├─ gb_passport_pricing ──→ Used by: british_passport_applications
gb_passport_services ┘
```

## Key Design Principles

1. **Separation of Concerns**
   - Lookup tables = What services exist
   - Pricing table = How much they cost
   - Application table = User's purchase record

2. **Foreign Keys Enforce Integrity**
   - Can't have invalid service in pricing
   - Can't delete service if pricing exists
   - Referential integrity at database level

3. **Text vs UUID**
   - Lookup tables: Text names (human readable)
   - Pricing table: UUID FK (database integrity)
   - Application table: Text names (historical record)

4. **Read-Heavy Design**
   - Lookups cached in API response
   - Frontend does filtering (not database)
   - JOINs only happen when needed
   - Minimal database load

## Migration Path from Old to New

```
Old Structure:
nadra_pricing {
  service_type: "NICOP/CNIC",
  service_option: "Normal",
  cost_price: 100,
  sale_price: 150
}

New Structure:
nadra_pricing {
  service_type_id: <uuid-1>,       ← Points to nadra_service_types
  service_option_id: <uuid-10>,    ← Points to nadra_service_options
  cost_price: 100,
  sale_price: 150
}

Where:
nadra_service_types (uuid-1):
  name: "NICOP/CNIC"

nadra_service_options (uuid-10):
  service_type_id: uuid-1
  name: "Normal"
```

## Benefits Summary

| Feature | Old | New |
|---------|-----|-----|
| Typos in service name | ❌ Possible | ✅ Prevented by dropdown |
| Rename service | ❌ Update everywhere | ✅ Update once in lookup |
| Add new service | ❌ Code change needed | ✅ Add to lookup table |
| Data consistency | ❌ Manual enforcement | ✅ FK constraints |
| Query services | ❌ Text matching | ✅ JOIN to lookup |
| Background pricing | ❌ Difficult | ✅ Easy (direct access) |
| Admin UI | ❌ Free-text fields | ✅ Validated dropdowns |

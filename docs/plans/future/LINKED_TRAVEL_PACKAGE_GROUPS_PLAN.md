# Linked Travel Package Groups Plan

**Status:** Future enhancement  
**Created:** July 21, 2026  
**Target Module:** Packages / Quotation Maker / Sales Mode / Package Folder  
**Related Plan:** `TRAVEL_PACKAGE_QUOTATION_RESERVATION_WORKFLOW_PLAN.md`  

---

## 1. Purpose

Some Umrah, ziyarat, and holiday enquiries involve multiple related families travelling together. Each family may want their own quote, payment split, documents, invoice, and package folder, but they may share common services.

The most common shared service is transport.

Example:

```text
Family A: 6 passengers
Family B: 4 passengers

Instead of booking:
- one vehicle for Family A
- one vehicle for Family B

The agent may book:
- one larger shared vehicle for all 10 passengers
```

This can reduce cost and improve operational coordination, but each family still needs to manage and pay for their own package separately.

The solution should be a **linked package group** model.

Packages remain separate. Shared services belong to the group.

---

## 2. Key Decision

Do not merge the families into one package.

Instead:

- keep each family as its own package quote and package folder
- create a group that links those packages together
- allow selected services, especially transport, to be marked as shared
- keep each package's customer view, final selection, invoice, payment plan, reservations, documents, and notes separate

This keeps operations flexible if one family changes, cancels, pays separately, upgrades hotels, or travels with slightly different passenger details.

---

## 3. Customer-Facing Rule

Transport shared cost should not be shown to the customer as a detailed split.

The customer only needs a simple note.

Example wording:

```text
Transport is shared with Family Hussain / Package PT-ABC123.
Your transport arrangements are included in your package total.
```

If the linked family name should stay private, use:

```text
Transport is shared with another linked family package.
Your transport arrangements are included in your package total.
```

The customer-facing package total should remain their own package total.

Transport split calculations should remain internal for agent and finance use.

---

## 4. WhatsApp Quote Rule

Do not add a complex linked package breakdown to the WhatsApp layout.

Only add a short transport note under the Transport section when applicable.

Example:

```text
***Transport Included***
* Jeddah Airport to Makkah Hotel
* Makkah Hotel to Madinah Hotel
* Madinah Hotel to Madinah Airport
* Shared with Family Hussain / PT-ABC123
```

No linked package totals should be included in WhatsApp.

No shared transport split should be included in WhatsApp.

---

## 5. Agent-Facing Rule

Agents do need to see the linked package group clearly.

In Quotation Maker, Sales Mode, and Package Folder, the system should show:

- linked group name/reference
- linked family/package names
- package A total
- package B total
- each package passenger count
- which services are shared
- internal shared transport cost
- internal allocation method
- whether the linked package is still draft, shared, selected, finalised, converted, or cancelled

This allows the agent to explain the package properly without exposing internal transport calculations to the customer.

---

## 6. Data Model

### 6.1 `travel_package_groups`

Stores the shared group.

Suggested fields:

```text
id
group_reference
title
lead_package_id
status
customer_visibility_mode
internal_notes
created_by
updated_by
created_at
updated_at
```

Suggested statuses:

```text
draft
active
partially_finalised
finalised
cancelled
completed
archived
```

Suggested customer visibility modes:

```text
private
linked_notice_only
shared_group_view
```

Default should be `linked_notice_only`.

### 6.2 `travel_package_group_members`

Links packages to the group.

Suggested fields:

```text
id
group_id
package_id
quote_id
family_label
customer_display_name
is_lead_family
customer_visible
sort_order
created_at
updated_at
```

Examples:

```text
Family Ali
Family Hussain
Family 1
Family 2
```

### 6.3 `travel_package_group_shared_services`

Stores services that are shared between linked packages.

Suggested fields:

```text
id
group_id
service_type
title
description
status
supplier_name
supplier_reference
currency
internal_total_cost
customer_note
allocation_mode
allocation_payload
metadata
created_by
updated_by
created_at
updated_at
```

Suggested service types:

```text
transport
guide
ziyarat
other
```

Suggested allocation modes:

```text
per_passenger
equal_per_package
manual
one_package_pays
no_split_note_only
```

Default should be `no_split_note_only` for customer-facing presentation, with internal allocation still available for finance.

### 6.4 `travel_package_group_service_allocations`

Stores internal cost allocation per package.

Suggested fields:

```text
id
shared_service_id
group_id
package_id
allocation_mode
passenger_count
allocated_cost
allocated_sale_value
internal_notes
created_at
updated_at
```

This table is internal only.

It should never be exposed directly in customer quote views.

---

## 7. Quotation Maker Changes

Add a linked package area near Quote Details.

Agent controls:

- create new linked group
- link this quote to an existing package group
- add another quote/package to the group
- set family label
- set customer visibility mode
- mark transport as shared with group
- add customer-facing shared transport note

Transport section changes:

- allow a transport option to be marked as `Shared with package group`
- when marked shared, show the group families internally
- keep the customer-facing text simple
- keep transport routes and vehicle selection attached to the package/group snapshot

The quote payload should store a group snapshot so historical quotes still show the original context even if the group changes later.

Suggested payload snapshot:

```json
{
  "linkedPackageGroup": {
    "groupId": "...",
    "groupReference": "PTG-ABC123",
    "title": "Ali / Hussain Umrah Oct 2026",
    "visibilityMode": "linked_notice_only",
    "currentFamilyLabel": "Family Ali",
    "linkedFamilies": [
      {
        "packageId": "...",
        "quoteId": "...",
        "familyLabel": "Family Hussain",
        "packageReference": "PT-ABC123",
        "customerVisible": true
      }
    ],
    "sharedServices": [
      {
        "serviceType": "transport",
        "customerNote": "Transport is shared with Family Hussain / PT-ABC123."
      }
    ]
  }
}
```

---

## 8. Sales Mode Changes

Sales Mode should support linked family context without becoming crowded.

Add a compact linked package banner:

```text
Linked package group: Ali / Hussain Umrah Oct 2026
This family: Family Ali
Shared service: Transport
```

Agent-only expandable detail:

- Package A total
- Package B total
- passenger counts
- selected options
- status of each package
- shared services
- internal allocation method

Customer-facing sales view should only show the simple note:

```text
Transport is shared with Family Hussain / PT-ABC123.
```

---

## 9. Customer Quote View Changes

When a customer opens their package quote link:

- show their own quote first
- show their own package total
- show their own selected options
- show shared transport note if applicable

If `customer_visibility_mode = shared_group_view`, add a switcher:

```text
Family Ali
Family Hussain
```

The switcher should allow the customer to view linked family quotations only when the agent has explicitly allowed visibility.

Default behaviour should be:

- no detailed linked family totals
- no shared transport cost split
- only a note that transport is shared

---

## 10. Package Folder Changes

Package folders should show linked group context in the operational workspace.

Add a linked group panel near the top:

```text
Linked group: Ali / Hussain Umrah Oct 2026
Family: Family Ali
Shared service: Transport
Linked packages: PT-ABC123, PT-XYZ456
```

Agent actions:

- open linked package
- open group view
- edit family label
- update shared transport note
- mark shared transport reservation created
- add or remove linked package
- convert linked quote to folder if not converted yet

Package folder should still keep:

- its own reservations
- its own payments
- its own invoice
- its own documents
- its own passengers
- its own audit trail

Shared transport reservation may belong to the group and be referenced by each linked package.

---

## 11. Transport Voucher Changes

Eventually, linked transport should generate one shared transport voucher.

The voucher should include:

- all passengers or passenger count by family, depending on privacy setting
- routes selected from the final quotation/group transport data
- shared vehicle type
- supplier/driver details
- pickup and drop-off timings
- QR code to digital voucher
- package references included in the shared transport

If privacy is required, the customer version can show only:

```text
Shared transport arranged for linked family package group.
```

Agent version can show full linked package details.

---

## 12. Finance and Invoice Rules

Do not create one shared customer invoice by default.

Each package/family keeps its own invoice.

Shared transport cost allocation is internal.

Finance can use the group shared service allocation to calculate:

- internal cost per package
- allocated sale value per package
- margin impact per package
- whether one family is covering the whole shared service

Customer invoice should show only the family package total unless the agent chooses to expose more detail.

---

## 13. Privacy Rules

Linked packages can involve separate families who may not want their personal details shared.

Default privacy should be conservative.

Customer should not see:

- other family contact details
- other family payment plan
- other family documents
- other family passport status
- other family internal notes
- supplier net costs
- shared transport internal split

Customer may see:

- family label
- shared transport note
- linked quote switcher only if enabled
- high-level package reference only if enabled

---

## 14. Suggested Build Phases

### Phase 1: Data Foundation

- Add package group tables.
- Add group members table.
- Add shared services table.
- Add shared service allocations table.
- Add quote payload snapshot support.

### Phase 2: Agent Linking UI

- Add Link Package button in quotation maker.
- Add linked package banner.
- Add family label field.
- Add shared transport note field.
- Allow linking existing quotes/packages.

### Phase 3: Customer and Sales Presentation

- Show shared transport note in customer quote.
- Show linked group context in sales mode.
- Add optional customer quote switcher.
- Keep WhatsApp output simple.

### Phase 4: Package Folder Integration

- Show linked group panel in package folder.
- Allow opening linked package folders.
- Allow group-level shared transport reservation.
- Keep package-level finance and documents separate.

### Phase 5: Transport Voucher Integration

- Generate shared transport voucher from group transport data.
- Include linked package references.
- Add customer-safe and agent-full voucher versions.

### Phase 6: Finance Allocation

- Add internal allocation controls.
- Support per-passenger, manual, equal, and one-family-pays allocation.
- Feed allocated internal costs into invoice/profit reporting.

---

## 15. Implementation Notes

- The first implementation should not try to solve every shared service type.
- Start with transport only.
- Keep the customer-facing output simple.
- Do not expose shared cost splits to customers.
- Keep each family/package financially independent.
- Store snapshots at quote finalisation time so future edits do not change historical quote meaning.
- Build the group model so it can later support shared guide, ziyarat, or tour services.

---

## 16. Open Questions For Later

- Should linked package groups be available before quote save, or only after the quote is saved?
- Should a linked group have its own reference format such as `PTG-ABC123`?
- Should the linked customer switcher require agent approval per linked package?
- Should the shared transport voucher show passenger names or only passenger counts?
- Should finance allocation affect customer sold price, internal booked cost only, or both?
- Should a package be allowed to belong to more than one group?

Recommended default answers:

- groups should be created after first quote save
- use `PTG-` references for groups
- require explicit agent approval for customer switcher visibility
- show passenger counts by default, names only if agent enables it
- affect internal booked cost first, with sold price remaining quote-controlled
- one package should belong to one active travel group at a time

# Ticketing Module - Detailed Plan

**Status:** Brainstorm Phase  
**Last Updated:** March 4, 2026  
**Owner:** PT-Portal Team

---

## 1. Overview

The **Ticketing Module** is a ledger-style system for managing airline ticket bookings with multi-agent low-fare workflow. Unlike simple logging, this is a **live working ledger** used for:

- Recording booking details with strict deadlines
- Tracking ticket issuance status and void management
- Calculating commissions on low-fare re-issues
- Supporting quick, efficient data entry (Excel-style)

**Key Difference:** Not a CRM or support system, but an **operational ledger with financial implications**.

---

## 2. Core Ledger Rules

### 2.1 Booking Lifecycle

1. **Agent X records a booking**
   - Passenger name, PNR, airline, departure + return dates
   - **Booking deadline date + time** (critical)
   - Sale cost agreed with customer
   - Initial fare cost from airline

2. **Issued Date Entry**
   - When ticket is actually issued, agent enters the date
   - Can be entered immediately or later (same day, next day, etc.)

3. **Void Logic**
   - If deadline passes AND no issued date is recorded → **void**
   - **24-hour grace window:** if issued_date is within 24h after deadline → still valid (marked "Late")
   - If deadline + 24h passes with no issued_date → **void**

4. **Low-Fare Workflow** (separate, linked)
   - Same or different agent finds cheaper fare
   - New fare recorded → **final_fare_cost** updated
   - Commission difference calculated
   - Profit = sale_cost − final_fare_cost

### 2.2 Status Auto-Computation

**System calculates status based on:**

- `deadline` + `deadline_time`
- `issued_date`
- Current date/time

**Possible statuses:**

- **Pending**: issued_date is NULL and (deadline + 24h) has not passed
- **On-Time**: issued_date ≤ deadline
- **Late (Valid)**: deadline < issued_date ≤ deadline + 24h
- **Void**: issued_date is NULL and current time > (deadline + 24h)
- **Cancelled**: manually marked cancelled

---

## 3. Data Models

### 3.1 ticket_ledger (Existing, Enhanced)

**Purpose:** Main booking record  
**Primary key:** id (uuid)

| Column             | Type      | Required | Notes                                        |
| ------------------ | --------- | -------- | -------------------------------------------- |
| id                 | uuid      | ✓        | Primary key                                  |
| employee_id        | uuid      | ✓        | Original agent who created booking           |
| final_agent_id     | uuid      | -        | Agent who found low fare (if applicable)     |
| passenger_name     | text      | ✓        | Full name                                    |
| contact_phone      | text      | ✓        | Phone number (W or T)                        |
| pnr                | text      | ✓        | Booking reference                            |
| airline_id         | uuid      | ✓        | Foreign key to airlines table (TBD)          |
| departure_date     | date      | ✓        | Outbound date                                |
| return_date        | date      | -        | Return date (if round trip)                  |
| booking_deadline   | timestamp | ✓        | Deadline date + time to issue                |
| issued_date        | date      | -        | When ticket was actually issued              |
| booking_type       | text      | ✓        | TK / DC / R-ER / FOC                         |
| booking_status     | text      | ✓        | Active / Cancelled                           |
| total_passengers   | integer   | ✓        | Number of pax                                |
| sale_cost          | numeric   | ✓        | Price charged to customer                    |
| initial_fare_cost  | numeric   | ✓        | Original airline fare                        |
| final_fare_cost    | numeric   | ✓        | Final fare paid (may be updated by low-fare) |
| payment_status     | text      | ✓        | Paid / Unpaid                                |
| package_id         | uuid      | -        | Related package (if any)                     |
| is_loyalty_claimed | boolean   | -        | Loyalty points claimed                       |
| created_at         | timestamp | ✓        | Row creation                                 |
| updated_at         | timestamp | -        | Last update (if low-fare applied)            |

**Computed (Not stored):**

- `profit = sale_cost - final_fare_cost`
- `status = computed from deadline + issued_date + now()`

---

### 3.2 low_fare_ledger (New Table)

**Purpose:** Track low-fare re-issues linked to main booking  
**Primary key:** id (uuid)  
**Foreign key:** ticket_ledger_id

| Column           | Type      | Required | Notes                             |
| ---------------- | --------- | -------- | --------------------------------- |
| id               | uuid      | ✓        | Primary key                       |
| ticket_ledger_id | uuid      | ✓        | Foreign key to ticket_ledger      |
| employee_id      | uuid      | ✓        | Agent who found low fare          |
| old_fare         | numeric   | ✓        | Previous final_fare_cost          |
| new_fare         | numeric   | ✓        | New lower fare                    |
| difference       | numeric   | -        | old_fare - new_fare (profit gain) |
| reissue_date     | date      | ✓        | When re-issued with lower fare    |
| notes            | text      | -        | Reason or justification           |
| created_at       | timestamp | ✓        | When recorded                     |

**When low-fare is created:**

1. Insert row into low_fare_ledger
2. Update ticket_ledger.final_fare_cost = new_fare
3. Update ticket_ledger.final_agent_id = current employee
4. Update ticket_ledger.updated_at = now()

---

### 3.3 Airlines Lookup Table (TBD)

**Purpose:** Dropdown for airline selection

| Column    | Type    |
| --------- | ------- |
| id        | uuid    |
| name      | text    |
| code      | text    |
| is_active | boolean |

**Common entries:** Emirates, FlyDubai, Turkish, Qatar, etc.

---

## 4. UI Design - Spreadsheet Style

### 4.1 Quick Entry Row

**Location:** Top or bottom of ledger table  
**Behavior:** Spreadsheet-like input with Tab navigation

```
[Passenger Name] [Phone] [PNR] [Airline ▼] [Dep Date]
[Deadline ▼] [Booking Type ▼] [Sale $] [Pax #] [Paid? ▼]
                                              [+ Save]
```

**Tab Navigation Order:**

1. Passenger Name → 2. Phone → 3. PNR → 4. Airline → 5. Departure Date
2. Return Date (optional) → 7. Deadline → 8. Booking Type → 9. Sale Cost → 10. Pax Count
3. Payment Status → 12. Save Button

**On Tab/Enter:**

- Move to next field in order
- Validate on blur (soft warnings for empty optional fields)
- Required fields block save if empty (hard validation)
- Tab from last field focuses Save button
- Escape clears row

### 4.2 Ledger Table Columns (Default View)

| Passenger      | PNR        | Airline     | Departure  | Return     | Deadline         | Issued | Type   | Sale     | Fare     | Status   | Paid | Actions    |
| -------------- | ---------- | ----------- | ---------- | ---------- | ---------------- | ------ | ------ | -------- | -------- | -------- | ---- | ---------- |
| John Doe       | AB1234     | Emirates    | 10 Mar     | 17 Mar     | 08 Mar 08:00     | -      | TK     | £850     | £800     | Pending  | ✓    | [Low Fare] |
| Jane Smith     | XY5678     | FlyDubai    | 12 Mar     | -          | 10 Mar 12:00     | 09 Mar | TK     | £450     | £420     | On-Time  | ✗    | [Low Fare] |
| ~~Ahmed Khan~~ | ~~LM9012~~ | ~~Turkish~~ | ~~05 Mar~~ | ~~12 Mar~~ | ~~03 Mar 14:00~~ | ~~-~~  | ~~TK~~ | ~~£600~~ | ~~£550~~ | **Void** | ✗    | -          |

_Note: Void rows appear with strikethrough text and red background badge_

### 4.3 Pagination & Filtering

**Default View:** Current calendar month (e.g., "March 2026")  
**Pagination Controls:**

- Previous / Next month buttons
- Quick jump to: This Month, Last Month, Last 90 Days
- Rows per page: 25 / 50 / 100

**Search/Filter Bar (always visible above table):**

- Date range picker (or month selector)
- Status filter (Pending / On-Time / Late / Void / All)
- Search by PNR or passenger name
- Agent filter (optional, if multi-team visibility)

### 4.4 Optional Columns (Toggle to Show)

- Agent (creator)
- Final Agent (low-fare agent)
- Booking Status
- Total Pax
- Loyalty Claimed
- Notes
- Created Date

### 4.5 Low-Fare Action

**For each booking row:**

- Click "Low Fare" button
- Opens **inline side panel or modal**
  - Current fare display
  - New fare input
  - Reissue date picker
  - Notes field
  - Save button

**On save:**

- Creates low_fare_ledger entry
- Updates ticket_ledger.final_fare_cost
- Updates ticket_ledger.final_agent_id
- Shows "Low Fare Applied" indicator on main row

---

## 5. Validation Rules

### 5.1 Smart Defaults (Pre-fill on new row)

- `issued_date` = NULL (agent to fill)
- `booking_status` = "Pending"
- `payment_status` = "Unpaid"
- `total_passengers` = 1
- `is_loyalty_claimed` = false

### 5.2 Required Fields (Block save if empty)

- ✓ Passenger name
- ✓ Phone
- ✓ PNR
- ✓ Airline
- ✓ Departure date
- ✓ Booking deadline (date + time)
- ✓ Booking type
- ✓ Sale cost
- ✓ Total passengers
- ✓ Payment status

### 5.3 Optional Fields

- Return date (only if round trip)
- Issued date (filled later)
- Package ID
- Final agent (auto-set if low fare)
- Notes

### 5.4 Soft Warnings (Suggest but allow save)

- Missing issued date (if booking is old)
- Missing initial_fare_cost
- Negative sale_cost
- Departure > Return date

---

## 6. API Routes to Build

### 6.1 POST /api/ticketing/add

**Request:**

```json
{
  "passenger_name": "John Doe",
  "contact_phone": "+971501234567",
  "pnr": "AB1234",
  "airline_id": "uuid",
  "departure_date": "2026-03-10",
  "return_date": "2026-03-17",
  "booking_deadline": "2026-03-08T08:00:00Z",
  "issued_date": null,
  "booking_type": "TK",
  "total_passengers": 2,
  "sale_cost": 850.0,
  "initial_fare_cost": 800.0,
  "payment_status": "Paid",
  "employee_id": "uuid"
}
```

**Response:** `{ success: true, id: "uuid" }`

### 6.2 GET /api/ticketing/list

**Query params:**

- `from_date`, `to_date` (filter by departure)
- `status` (Pending / On-Time / Late / Void)
- `employee_id` (filter by recording agent)
- `search` (PNR / passenger name)

**Response:** Array of ticket records with computed status

### 6.3 POST /api/ticketing/low-fare

**Request:**

```json
{
  "ticket_ledger_id": "uuid",
  "new_fare": 750.0,
  "reissue_date": "2026-03-09",
  "notes": "Found cheaper via Turkish",
  "employee_id": "uuid"
}
```

**Response:** `{ success: true, low_fare_id: "uuid", new_final_fare: 750.00 }`

### 6.4 PATCH /api/ticketing/{{id}}

**Updates a specific booking** (e.g., issue date)

### 6.5 GET /api/ticketing/airlines

**Return list of airlines for dropdown**

---

## 7. Frontend Structure

### 7.1 Page: `/dashboard/ticketing`

Main ticketing page with:

- Quick entry row (spreadsheet style)
- Ledger table with filters
- Low-fare actions per row
- Search / date range filter

### 7.2 Components

- `TicketingTable.tsx` - Main ledger table
- `QuickEntryRow.tsx` - Inline quick add row
- `LowFareModal.tsx` or `LowFarePanel.tsx` - Side panel for low-fare entry
- `AirlineSelect.tsx` - Dropdown for airlines
- `StatusBadge.tsx` - Color-coded status (Pending / On-Time / Late / Void)

### 7.3 Hooks

- `useTicketingList()` - Fetch and filter ledger
- `useQuickEntry()` - Handle quick row validation + save
- `useLowFareAdd()` - Handle low-fare submission

---

## 8. Business Logic - Status Calculation

```typescript
enum TicketStatus {
  Pending = 'Pending',
  OnTime = 'On-Time',
  Late = 'Late (Valid)',
  Void = 'Void',
  Cancelled = 'Cancelled',
}

function computeTicketStatus(
  deadline: Date,
  issued_date: Date | null,
  now: Date = new Date(),
): TicketStatus {
  if (!deadline) return TicketStatus.Pending

  const graceEnd = new Date(deadline.getTime() + 24 * 60 * 60 * 1000)

  if (!issued_date) {
    return now > graceEnd ? TicketStatus.Void : TicketStatus.Pending
  }

  if (issued_date <= deadline) {
    return TicketStatus.OnTime
  }

  if (issued_date <= graceEnd) {
    return TicketStatus.Late
  }

  return TicketStatus.Void
}
```

---

## 9. Commission Model (Future - Data Preparation)

**Not implemented now, but data stored for later:**

- Commission per booking (Agent X):  
  `commission_a = sale_cost × agent_commission_rate`
- Commission per low-fare (Low-Fare Agent):  
  `commission_b = (old_fare - new_fare) × low_fare_commission_rate`

These rates would live in a settings table (not designed yet).

---

## 10. Implementation Roadmap

### Phase 1: Data Models + API

- [ ] Create / verify `ticket_ledger` schema
- [ ] Create `low_fare_ledger` table in Supabase
- [ ] Create / verify `airlines` lookup table
- [ ] Build API routes (add, list, update, low-fare, airlines)

### Phase 2: Frontend - Quick Entry

- [ ] Build `QuickEntryRow` component (spreadsheet-style)
- [ ] Build `TicketingTable` component
- [ ] Implement inline validation / soft warnings
- [ ] Save to backend on valid entry

### Phase 3: Frontend - Display + Filters

- [ ] Status badge + color coding
- [ ] Date range filter
- [ ] Status filter
- [ ] Search by PNR / passenger
- [ ] Optional columns toggle

### Phase 4: Low-Fare Workflow

- [ ] Build `LowFareModal.tsx` or side panel
- [ ] Implement low-fare save + update main ledger
- [ ] Show "Low Fare Applied" indicator
- [ ] Link to low-fare ledger (optional detailed view)

### Phase 5: Refinements

- [ ] Audit trail (who changed what, when)
- [ ] Void ticket notifications (if deadline passing soon)
- [ ] Bulk actions (if needed)
- [ ] Export to Excel (for backup/archiving)

---

## 11. Agent Access & Permissions (Reminder Notes)

**To clarify during implementation:**

- Can agents edit their own past bookings? (Recommend: view only, new corrections create audit entry)
- Can Agent B edit Agent A's bookings? (Recommend: no, except low-fare agent can add low-fare)
- Change audit trail: track who modified what field and when?
- Low-fare agent: can they only add low-fare, or also edit other fields? (Recommend: low-fare only)

---

## 12. Outstanding Questions / TBD

1. **Airlines Table**  
   Do we create this, or do agents type? (Recommend dropdown from table)

2. **Notification on Void Risk**  
   Should system warn agent 12h before deadline if no issued date?

3. **Loyalty Points**  
   How is `is_loyalty_claimed` determined? Manual flag or auto-computed?

4. **Package ID**  
   Is this a package booking (like Umrah trips)? Keep optional?

5. **Daily Ledger Integration**  
   Should bookings auto-populate `daily_ledger_entries` for accounting?

---

## 13. Walkthrough Example

**Scenario 1: On-Time Booking**

1. Agent enters: John Doe | +97150123 | AB1234 | Emirates | 10 Mar | 17 Mar | **08 Mar 08:00** (deadline) | TK | £850 | £800 | Paid
2. System status: **Pending** (issued_date is NULL, deadline not passed)
3. Agent issues ticket on **10 Mar 6am**, enters into ledger
4. System status updates to: **On-Time** ✓ (issued_date ≤ deadline)
5. Row appears normal

**Scenario 2: Late But Valid**

1. Same booking, but agent issues ticket on **10 Mar 10am** (2h after deadline)
2. System status: **Late (Valid)** ⚠️ (deadline < issued_date ≤ deadline + 24h)
3. Row appears with yellow indicator

**Scenario 3: Void (Missed Deadline)**

1. Same booking, agent never issues ticket
2. Current time passes **09 Mar 08:01am** (deadline + 24h + 1min)
3. System status: **Void** 🔴 (issued_date is NULL AND now > deadline + 24h)
4. Row appears with ~~strikethrough text~~ and red background

**Scenario 4: Low-Fare Adjustment**

1. After booking is On-Time with sale_cost £850, initial_fare £800
2. **Agent B finds cheaper fare** on Turkish: £750
3. Clicks "Low Fare" on John Doe row
4. Enters: new_fare = £750, reissue_date = 11 Mar, notes = "Turkish Airlines"
5. System:
   - Creates low_fare_ledger entry
   - Updates ticket_ledger.final_fare_cost = £750
   - Updates ticket_ledger.final_agent_id = Agent B
   - Updates ticket_ledger.updated_at = now()
   - Shows "Low Fare Applied" label on row
6. Commission: (£850 − £750) = £100 profit for Agent B

---

## 14. Notes & Decisions

- **Excel-style UX:** No modal forms. Quick entry row behaves like spreadsheet.
- **Ledger is source of truth:** All commission, PnL, agent KPI calculated from here.
- **Status is computed:** Not stored. Calculated on-the-fly based on deadline + issued_date + now.
- **Low-fare is separate:** New table, linked, keeps audit trail clean.
- **Grace window is strict:** 24h after deadline, no flexibility (can be changed later).
- **Default to current agent:** `employee_id` auto-fills from session.

---

## 15. References

- **Existing ticket_ledger schema:** `/workspaces/pt-portal/` (Supabase)
- **Excel template:** `docs/Rida 2025.xlsx`
- **Related tables:** `daily_ledger_entries`, `loyalty_points_ledger`

---

**Next Step:** Answer TBD questions (section 11), then begin Phase 1 implementation.

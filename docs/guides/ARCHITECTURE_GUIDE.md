# Architecture Guide

> PT-Portal — Next.js 16 + Supabase + MinIO + Cloudflare R2
> Last updated: August 12, 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Request Flow](#request-flow)
4. [Project Structure](#project-structure)
5. [Authentication Architecture](#authentication-architecture)
6. [Storage Architecture](#storage-architecture)
7. [Database Architecture](#database-architecture)
8. [Feature Modules](#feature-modules)
9. [Shared Libraries](#shared-libraries)
10. [Rate Limiting](#rate-limiting)
11. [Deployment](#deployment)

---

## System Overview

PT-Portal is an internal business portal for Piyam Travels, managing travel documents, NADRA applications, passport processing, visa tracking, loan management, appointment bookings, timeclock, employee records and document storage.

```
┌────────────────────────────────────────────────────────────┐
│                    Browser (Client)                        │
│       React 18 · TypeScript · Tailwind CSS v3              │
└─────────────────────┬──────────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼──────────────────────────────────────┐
│              Next.js 16.3 (Vercel)                         │
│   App Router · Turbopack · Proxy (request correlation)     │
│                                                            │
│   /app/api/**        ← Server-side API routes              │
│   /app/dashboard/**  ← Protected SSR/RSC pages             │
│   /app/login/**      ← Auth pages                          │
└──────┬──────────────────────────┬──────────────────────────┘
       │                          │
┌──────▼──────┐          ┌────────▼────────────────────────┐
│  Supabase   │          │         Storage Layer           │
│  (Postgres) │          │                                 │
│  - Auth     │          │  EU Server 49v2 (MinIO)         │
│  - Profiles │          │  Primary · S3-compatible        │
│  - All app  │          │  Bucket: portal-documents       │
│    data     │          │                                 │
│  - Documents│          │  EU Server 45v5 (R2)            │
│    metadata │          │  Fallback · Cloudflare R2       │
└─────────────┘          │  Bucket: portal-fallback        │
                         └─────────────────────────────────┘
```

---

## Technology Stack

| Layer               | Technology            | Version |
| ------------------- | --------------------- | ------- |
| Framework           | Next.js               | 16.3    |
| UI Runtime          | React                 | 18.3    |
| Language            | TypeScript            | 5.3     |
| Styling             | Tailwind CSS          | 3.4     |
| Icons               | Lucide React          | 0.562   |
| Database            | Supabase (PostgreSQL) | 2.87    |
| Primary Storage     | MinIO (S3-compatible) | —       |
| Fallback Storage    | Cloudflare R2         | —       |
| Storage SDK         | AWS SDK v3            | 3.1006  |
| PDF Rendering       | pdfjs-dist            | 5.5.207 |
| Toast Notifications | Sonner                | 2.0     |
| Progress Bar        | next-nprogress-bar    | 2.4     |
| QR Scanning         | jsqr                  | 1.4     |
| Deployment          | Vercel                | —       |

---

## Request Flow

### Authenticated Page Request

```
Browser → Next.js request proxy (correlation ID) → RSC/SSR Page
→ Supabase cookie-backed user validated server-side
→ Page renders with server data
```

### API Request (documents example)

```
Browser XHR → POST /api/documents/upload-direct
→ Canonical active-staff session guard
→ Shared Postgres limit (user + IP; 20 requests / 10 minutes)
→ Validate scope, size, filename, signature, MIME type, and extension
→ Try private MinIO PutObjectCommand
  ✓ Success → save metadata to Supabase → return { storageProvider: 'minio' }
  ✗ Fail → Try R2 PutObjectCommand
    ✓ Success → save metadata with minio_bucket=portal-fallback → return { storageProvider: 'r2' }
    ✗ Fail → 503 Service Unavailable
```

---

## Project Structure

```
pt-portal/
├── app/
│   ├── api/                    Server-side API routes
│   │   ├── admin/              Admin utilities (employee, LMS seeding)
│   │   ├── auth/               Auth (2FA, backup codes, sessions, passwords)
│   │   ├── documents/          Document CRUD + storage operations
│   │   ├── bookings/           Appointment booking APIs
│   │   ├── lms/                Loan Management System
│   │   ├── nadra/              NADRA application management
│   │   ├── passports/          Pakistani + GB passport management
│   │   │   ├── pak/
│   │   │   └── gb/
│   │   ├── timeclock/          Clock-in/out, manual entry, QR scan
│   │   ├── visas/              Visa application management
│   │   └── vitals/             Web Vitals reporting
│   │
│   ├── auth/                   Auth pages (new-password)
│   ├── components/             Shared layout components
│   │   ├── GlobalFooter.tsx
│   │   ├── PageHeader.client.tsx
│   │   ├── ProgressBarProvider.tsx
│   │   ├── RootErrorBoundary.tsx
│   │   ├── SessionWarningHeader.tsx
│   │   └── WebVitalsReporter.tsx
│   │
│   ├── dashboard/              All protected dashboard pages
│   │   ├── page.tsx            Main dashboard
│   │   ├── account/            User account & profile
│   │   ├── applications/
│   │   │   ├── nadra/          NADRA services + DocumentHub
│   │   │   ├── passports/      Pakistani passports
│   │   │   ├── passports-gb/   GB passports
│   │   │   └── visa/           Visa applications
│   │   ├── bookings/           Appointment calendar + booking operations
│   │   ├── commissions/        Commission tracking
│   │   ├── lms/                Loan management & statements
│   │   ├── pricing/            Pricing management
│   │   ├── settings/           System settings
│   │   ├── ticketing/          Support ticketing
│   │   └── timeclock/          Time tracking (history, manual entry, team)
│   │
│   ├── hooks/                  App-specific hooks
│   ├── lib/                    App-specific utilities
│   ├── login/                  Login, 2FA setup, 2FA verify
│   └── types/                  TypeScript type definitions
│
├── components/                 Generic reusable UI components
│   ├── ConfirmationDialog.tsx
│   ├── ModalBase.tsx
│   └── index.ts
│
├── hooks/                      Generic reusable hooks
│   ├── useAsync.ts
│   ├── useFormState.ts
│   ├── useModal.ts
│   ├── usePagination.ts
│   └── useTableFilters.ts
│
├── lib/                        Server-side singletons & utilities
│   ├── adminSessionAuth.ts     Role-scoped staff-session wrappers
│   ├── auth/staffSession.ts    Canonical verified staff-session guard
│   ├── security/rateLimit.ts   Shared PostgreSQL rate-limit client
│   ├── observability/server.ts Redacted structured server events
│   ├── documentAccess.ts       Database-backed document scope validation
│   ├── documentSecurity.ts     Upload/stream validation and safe headers
│   ├── installmentsDb.ts       Installment DB helpers
│   ├── r2Client.ts             Cloudflare R2 singleton client
│   ├── r2Migration.ts          R2 → MinIO migration logic
│   ├── s3Client.ts             MinIO singleton client
│   ├── supabaseClient.ts       Supabase singleton clients
│   ├── constants/              Shared constants (API, UI, validation)
│   └── services/
│       └── documentService.ts  Client-side document service layer
│
├── proxy.ts                    Correlation IDs for API requests/responses
├── next.config.js
├── tailwind.config.js
└── vercel.json
```

---

## Authentication Architecture

### Login Flow

```
1. User enters credentials → POST /api/auth/password-login
2. The server validates limits/login guard and verifies with Supabase
3. Browser establishes the returned cookie-backed Supabase session
4. If 2FA enabled → redirect to /login/verify-2fa
   - User enters TOTP code or backup code
5. Active employee and branch checks pass → redirect to /dashboard
```

### 2FA Implementation

- TOTP-based (Time-based One-Time Password)
- Setup via `/login/setup-2fa` — generates QR code
- Verify via `/login/verify-2fa`
- Backup codes available via `/api/auth/generate-backup-codes`
- Consumed one-time via `/api/auth/consume-backup-code`
- Self-reset via `/api/auth/reset-2fa`, with a fresh TOTP or backup code
- Master/Super Admin break-glass recovery via `/api/admin/recover-employee-2fa`
- Backup-code replacement is atomic in PostgreSQL

### Session Management

- Session stored through the Supabase browser/auth-helper cookie integration
- `useSessionTimeout` hook warns user before expiry
- `SessionWarningHeader` component shows countdown banner
- Active sessions tracked: `GET /api/auth/sessions`

### Admin Authorization

Protected API routes use `requireStaffSession()` from `lib/auth/staffSession.ts`. It verifies the cookie-backed user with `auth.getUser()`, resolves an active employee server-side, and optionally checks roles and `employee_departments` membership.

Administrative routes use wrappers from `lib/adminSessionAuth.ts`:

- `requireAdminSession()`: Admin, Master Admin, or Super Admin
- `requireMaintenanceSession()`: Maintenance Admin plus admin roles
- `requireSuperAdminSession()`: Master Admin or Super Admin

The service-role client is created only after this authorization boundary; possession of a caller-supplied employee ID is never identity proof.

---

## Storage Architecture

See **[technical/STORAGE_SYSTEM.md](../technical/STORAGE_SYSTEM.md)** for the full deep dive.

### Summary

| Aspect                | Primary (MinIO)        | Fallback (R2)                     |
| --------------------- | ---------------------- | --------------------------------- |
| Server label          | EU Server 49v2         | EU Server 45v5                    |
| S3 Endpoint           | eu49v2.piyamtravel.com | a09d97...r2.cloudflarestorage.com |
| Display URL           | —                      | eu45v5.piyamtravel.com            |
| Bucket                | portal-documents       | portal-fallback                   |
| Probe timeout         | 2,500 ms               | 2,500 ms                          |
| Status check interval | 5 minutes              | —                                 |
| Auto-migration        | —                      | On status check + on read         |

---

## Database Architecture

Supabase (PostgreSQL) hosts all application data.

### Key Tables

| Table                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `profiles`           | User accounts, roles, employee data                         |
| `documents`          | Document metadata (key, bucket, size, category, family ref) |
| `nadra_applications` | NADRA service applications                                  |
| `passports`          | Pakistani passport applications                             |
| `gb_passports`       | GB passport applications                                    |
| `visa_applications`  | Visa applications                                           |
| `bookings`           | Appointment records per branch/service                      |
| `booking_services`   | Appointment service definitions and timing rules            |
| `branch_settings`    | Weekly branch appointment schedule                          |
| `lms_accounts`       | Loan management accounts                                    |
| `installments`       | Individual payment installments                             |
| `timeclock_events`   | Clock-in/out records                                        |
| `commissions`        | Agent commission records                                    |

### Document Table (key columns)

```sql
documents (
  id            uuid PRIMARY KEY,
  family_head_id text,
  file_name     text,
  file_type     text,
  file_size     bigint,
  minio_key     text,          -- Object key used in both MinIO and R2
  minio_bucket  text,          -- 'portal-documents' or 'portal-fallback'
  minio_etag    text,
  category      text,          -- 'main', 'receipts', 'application-review'
  uploaded_at   timestamptz,
  deleted       boolean DEFAULT false
)
```

---

## Feature Modules

| Module              | Routes                                         | Description                                      |
| ------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Document Hub        | `/dashboard/applications/nadra/documents/[id]` | Family document management with MinIO/R2 storage |
| NADRA               | `/dashboard/applications/nadra`                | NADRA services ledger, status management         |
| Pakistani Passports | `/dashboard/applications/passports`            | PAK passport applications                        |
| GB Passports        | `/dashboard/applications/passports-gb`         | GB passport applications                         |
| Visas               | `/dashboard/applications/visa`                 | Visa applications                                |
| Bookings            | `/dashboard/bookings`                          | Branch-aware appointment scheduling              |
| LMS                 | `/dashboard/lms`                               | Loan management, installments, statements        |
| Timeclock           | `/dashboard/timeclock`                         | QR clock-in/out, manual entry, team view         |
| Commissions         | `/dashboard/commissions`                       | Agent commission tracking                        |
| Pricing             | `/dashboard/pricing`                           | Service pricing management                       |
| Settings            | `/dashboard/settings`                          | System configuration                             |
| Ticketing           | `/dashboard/ticketing`                         | Support tickets                                  |

### Appointment Bookings Notes

- The bookings module is the main feature currently under active development
- Current implementation includes branch schedules, one-off overrides, slot generation, reminder settings, attendance confirmation links, no-show penalty tracking, and audit logging
- The feature is still unfinished and should be treated as an active work area rather than a fully settled product area

### Applications Notes

- NADRA, Pakistani passports, GB passports, and visas remain active operational modules
- Recent work in applications has mostly been small workflow and storage-adjacent fixes rather than major architecture changes
- Supporting flows include notes/history/refund-related endpoints, document linkage, and receipt generation across key service types

---

## Shared Libraries

### Singleton Clients (server-side)

All storage/database clients are module-level singletons — instantiated once per serverless worker lifecycle to maximise connection reuse.

| File                    | Export                                           | Purpose                       |
| ----------------------- | ------------------------------------------------ | ----------------------------- |
| `lib/s3Client.ts`       | `getS3Client()`                                  | MinIO AWS SDK v3 client       |
| `lib/r2Client.ts`       | `getR2Client()`, `isR2Configured()`              | Cloudflare R2 client          |
| `lib/supabaseClient.ts` | `getSupabaseClient()`, `getSupabaseAnonClient()` | Supabase service/anon clients |

### Generic Hooks (`hooks/`)

| Hook              | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `useAsync`        | Wrap async operations with loading/error state |
| `useFormState`    | Controlled form field management               |
| `useModal`        | Open/close/data state for modals               |
| `usePagination`   | Page index + page size management              |
| `useTableFilters` | Column filter state for data tables            |

### Shared Feature Hooks (`hooks/`)

| Hook                  | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `useMinioConnection`  | Poll `/api/documents/status`, expose `connected`, `ping`, `status` |
| `useSessionTimeout`   | Track session expiry, trigger warning UI                           |
| `useVisaFiltering`    | Visa table filter/sort state                                       |
| `useVisaFormState`    | Visa application form state                                        |
| `useStatementData`    | LMS statement data loading                                         |
| `useStatementFilters` | LMS statement filter state                                         |
| `usePricingOptions`   | Pricing option loading                                             |
| `useSecuritySessions` | Active security session listing                                    |

---

## Rate Limiting

Sensitive routes call `enforceRateLimit()` in `lib/security/rateLimit.ts`:

- Limits are fixed-window counters persisted in PostgreSQL and shared by all application replicas.
- Each route selects its own scope, window, limit, and identity combination (for example user, normalized email, or IP).
- Identity material is keyed with `RATE_LIMIT_HASH_SECRET` and hashed before storage.
- A blocked request returns `429 Too Many Requests` with an exact `Retry-After` value.
- Sensitive routes fail closed with `503` if the shared limiter is unavailable.
- `proxy.ts` propagates `x-request-id` for correlation; it deliberately does not keep an in-memory limiter.

Deploy `scripts/migrations/20260812_security_rate_limits.sql` before code that uses the shared limiter.

---

## Deployment

### Vercel

The app is deployed on Vercel with:

- Automatic deployments on push to `main`
- Environment variables set in Vercel project settings
- `vercel.json` for custom configuration

### Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RATE_LIMIT_HASH_SECRET    # long independent server-only random value

MINIO_ENDPOINT            # https://eu49v2.piyamtravel.com
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET_NAME         # portal-documents
NEXT_PUBLIC_MINIO_ENDPOINT

R2_ENDPOINT               # https://<account-id>.r2.cloudflarestorage.com
R2_PING_URL               # https://eu45v5.piyamtravel.com  (display only)
R2_ACCESS_KEY
R2_SECRET_KEY
R2_BUCKET_NAME            # portal-fallback

OBSERVABILITY_ALERT_WEBHOOK_URL # optional trusted receiver for redacted operational alerts
```

### Build Command

```bash
npm run build   # next build (Turbopack)
npm run dev     # next dev (local)
npm run lint    # eslint
```

│ ├── lms/ # Loan management system
│ ├── pricing/ # Pricing management
│ └── settings/ # Settings & admin
│
├── hooks/ # Custom React hooks
│ ├── useLmsData.ts # Loan data fetching
│ ├── usePricingOptions.ts # Pricing state management
│ └── ... other hooks
│
├── lib/ # Utilities & helpers
│ ├── errorHandler.ts # Error handling
│ ├── pricingOptions.ts # Pricing constants
│ └── ... other utilities
│
├── types/ # TypeScript type definitions
│ ├── pricing.ts # Pricing types
│ ├── application.ts # Application types
│ └── ... other types
│
├── auth/ # Authentication pages
│ ├── login/
│ └── setup-2fa/
│
├── layout.tsx # Root layout
├── page.tsx # Home page
└── globals.css # Global styles

````

---

## 🔀 Component Architecture

### Server Components vs Client Components

#### Server Components (Default)
- No `'use client'` directive
- Run on the server
- Access databases directly
- More secure (no secrets exposed)
- Used for: Page layouts, authentication checks, data fetching

```typescript
// Example: Page.tsx (Server Component)
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export default async function DashboardPage() {
  const supabase = await getRouteSupabaseClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) redirect('/login')

  return <div>Welcome {data.user.email}</div>
}
````

#### Client Components

- Start with `'use client'` directive
- Run in user's browser
- Can use React hooks (useState, useEffect, etc.)
- Can't access server secrets
- Used for: Interactive features, forms, filters

```typescript
// Example: Client Component
'use client'

import { useState } from 'react'

export default function SearchFilter() {
  const [search, setSearch] = useState('')

  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  )
}
```

### Component Hierarchy Example

```
DashboardPage (Server Component)
├── Auth Check (verify logged in)
├── PageHeader (Client Component)
│   ├── UserMenu
│   └── Notifications
└── DashboardClient (Client Component)
    ├── StatisticsCards
    │   ├── StatCard
    │   ├── StatCard
    │   └── StatCard
    ├── ApplicationsList
    │   └── ApplicationRow (×many)
    └── PaginationControls
```

---

## 🔌 Data Flow (Example: LMS)

### Step 1: User Navigates to LMS

```
Browser → /dashboard/lms → Next.js Router
```

### Step 2: Server Component Loads

```
Server Component (page.tsx)
├── Authenticate user
├── Get user session
└── Pass session to client component
```

### Step 3: Client Component Initializes

```
Client Component (client.tsx)
├── Mount with React.memo (prevent re-renders)
├── useRef to track previous filters
├── useLmsData(filter) hook to fetch data
└── useLmsFilters(data) to search locally
```

### Step 4: Data Fetching

```
useCallback(() => {
  supabase.from('accounts')
    .select('*')
    .range(offset, offset + 50)  // Pagination
    .then(data => setAccounts(data))
})
```

### Step 5: Display Data

```
Component renders:
├── Table with accounts
├── Pagination controls
├── Search/filter inputs
└── Action buttons (Edit, Delete, etc.)
```

### Step 6: User Interaction

```
User clicks → Button → Handler function
→ API call → Supabase update → Re-fetch data
→ Component re-renders with new data
```

---

## 🎣 Custom Hooks (State Management)

### `useLmsData` Hook

**Purpose**: Fetch loan account data with pagination and filtering

```typescript
const {
  accounts, // Array of accounts
  loading, // Is loading?
  error, // Error message
  total, // Total account count
  currentPage, // Current page number
  fetchAccounts, // Manual fetch function
  setFilter, // Update search filter
} = useLmsData(supabase)
```

**How it Works:**

1. Takes Supabase client as input
2. Maintains state for: accounts, loading, current filter
3. Uses `useRef` to track previous filter (prevents infinite loops)
4. Only fetches when filter actually changes
5. Returns all needed data and functions

### `usePricingOptions` Hook

**Purpose**: Manage pricing data and edit state

```typescript
const {
  nadraPricing, // Array of NADRA prices
  pkPassPricing, // Array of Pakistan passport prices
  gbPassPricing, // Array of GB passport prices
  visaPricing, // Array of visa prices
  editingId, // Currently editing ID
  editValues, // Edit form values
  fetchPricing, // Fetch all pricing data
  handleEdit, // Start editing
  handleSave, // Save changes
  handleDelete, // Delete pricing entry
} = usePricingOptions(supabase)
```

### Hook Best Practices

```typescript
// ✅ GOOD: Memoize hook functions to prevent infinite loops
const fetchData = useCallback(async () => { ... }, [supabase])

// ✅ GOOD: Use ref to track state without triggering effects
const prevFilterRef = useRef(filter)

// ✅ GOOD: Specific dependency arrays to minimize re-renders
useEffect(() => { ... }, [supabase, userId])  // Only when these change

// ❌ BAD: Don't use hook functions directly in effect deps
useEffect(() => { fetchData() }, [fetchData])  // Creates loop!

// ❌ BAD: Empty dependency array when you need data
useEffect(() => { fetchData() }, [])  // Won't react to prop changes
```

---

## 📡 API Routes

### Creating a New API Route

**File Structure:**

```
app/api/my-feature/route.js (or route.ts for TypeScript)
```

**Example: Get Loan Accounts**

```javascript
import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getSupabaseClient } from '@/lib/supabaseClient'

export async function GET(req) {
  // 1. Authenticate and resolve the active employee before a service-role query.
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    // 2. Get bounded parameters from URL
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '50')))
    const offset = (page - 1) * limit

    // 3. Perform the privileged query only after authorization.
    const { data, error, count } = await getSupabaseClient()
      .from('accounts')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return apiOk({ data, total: count, page, limit })
  } catch (error) {
    return apiError('Unable to load accounts', 500)
  }
}
```

### API Route Patterns

**GET** - Fetch data

```javascript
export async function GET(req) { ... }
```

**POST** - Create data

```javascript
export async function POST(req) {
  const body = await req.json()
  // Process and save
}
```

**PUT** - Update data

```javascript
export async function PUT(req) {
  const body = await req.json()
  // Update database
}
```

**DELETE** - Delete data

```javascript
export async function DELETE(req) {
  const id = searchParams.get('id')
  // Delete from database
}
```

---

## 🎨 Styling

### Tailwind CSS Usage

PT-Portal uses **Tailwind CSS** for styling (no separate CSS files).

```typescript
// Example: Styled Button Component
export function Button({ variant = 'primary', children }) {
  const baseStyles = 'px-4 py-2 rounded font-medium transition'
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  }

  return (
    <button className={`${baseStyles} ${variants[variant]}`}>
      {children}
    </button>
  )
}
```

### Common Tailwind Classes

| Class                               | Effect            |
| ----------------------------------- | ----------------- |
| `px-4 py-2`                         | Padding           |
| `rounded`                           | Border radius     |
| `bg-blue-600`                       | Background color  |
| `text-white`                        | Text color        |
| `hover:bg-blue-700`                 | Hover effect      |
| `flex items-center justify-between` | Flexbox layout    |
| `grid grid-cols-3 gap-4`            | Grid layout       |
| `md:flex lg:grid`                   | Responsive design |
| `animate-spin`                      | Animation         |
| `opacity-50`                        | Transparency      |

---

## 🔐 Authentication & Authorization

### Authentication Flow

```
1. User visits /login
2. Enters email/password
3. Supabase verifies credentials
4. Session token created
5. Supabase browser client establishes its cookie-backed session
6. User redirected to dashboard
7. On protected pages: session verified server-side
8. If no session: redirect to /login
```

### Protected Pages

```typescript
// Server component - check auth
export default async function ProtectedPage() {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')  // Force login
  }

  return <Content userId={user.id} />
}
```

### Authorization Levels

| Level       | Permissions                          |
| ----------- | ------------------------------------ |
| **User**    | View own data, edit own applications |
| **Manager** | Manage team data, change statuses    |
| **Admin**   | All access, system configuration     |

---

## 🐛 Debugging Tips

### Console Logging

```typescript
// In client component
console.log('User data:', userData)

// See in browser DevTools (F12)
```

### React DevTools

1. Install extension: React Developer Tools
2. Open DevTools (F12)
3. Go to "React" tab
4. Inspect component tree
5. View props and state

### Network Tab Debugging

1. Open DevTools (F12)
2. Go to "Network" tab
3. Make API call
4. Click request to see:
   - Request headers
   - Request body
   - Response
   - Status code

### Performance Profiling

```typescript
// Measure render time
console.time('render')
// ...code...
console.timeEnd('render') // Shows milliseconds
```

---

## 📊 Database Schema

### Key Tables

#### `accounts`

```sql
id: UUID
customer_name: VARCHAR
email: VARCHAR
phone: VARCHAR
cnic: VARCHAR
current_balance: DECIMAL
available_credit: DECIMAL
created_at: TIMESTAMP
is_active: BOOLEAN
```

#### `transactions`

```sql
id: UUID
account_id: UUID (FK)
amount: DECIMAL
payment_date: DATE
payment_method: VARCHAR
reference_number: VARCHAR
created_at: TIMESTAMP
```

#### `applications`

```sql
id: UUID
customer_name: VARCHAR
application_type: VARCHAR (nadra/passport/visa)
status: VARCHAR (draft/submitted/approved)
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

---

## 🚀 Adding a New Feature

### Step-by-Step Example: Add "Export to Excel"

#### 1. Create API Endpoint

**File:** `app/api/accounts/export/route.js`

```javascript
export async function POST(req) {
  const { ids } = await req.json()
  // Query accounts with those IDs
  // Format as Excel
  // Return file
}
```

#### 2. Create Hook for Export

**File:** `hooks/useExportAccounts.ts`

```typescript
export const useExportAccounts = () => {
  const [exporting, setExporting] = useState(false)

  const exportToExcel = async (accountIds) => {
    setExporting(true)
    const response = await fetch('/api/accounts/export', {
      method: 'POST',
      body: JSON.stringify({ ids: accountIds }),
    })
    const blob = await response.blob()
    // Download blob as file
    setExporting(false)
  }

  return { exportToExcel, exporting }
}
```

#### 3. Add UI Button

**File:** `app/dashboard/lms/client.tsx`

```typescript
'use client'

import { useExportAccounts } from '@/hooks/useExportAccounts'

export default function LMSClient() {
  const { exportToExcel, exporting } = useExportAccounts()
  const [selectedIds, setSelectedIds] = useState([])

  return (
    <>
      <button
        onClick={() => exportToExcel(selectedIds)}
        disabled={exporting}
      >
        {exporting ? 'Exporting...' : 'Export to Excel'}
      </button>
    </>
  )
}
```

---

## ✅ Code Quality Standards

### TypeScript Usage

```typescript
// ✅ Define types for props
interface ButtonProps {
  variant: 'primary' | 'secondary'
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}

export function Button(props: ButtonProps) { ... }

// ❌ Don't use `any`
function handleData(data: any) { ... }
```

### Error Handling

```typescript
// ✅ Proper error handling
try {
  const result = await fetch(url)
  if (!result.ok) throw new Error(`HTTP ${result.status}`)
  return await result.json()
} catch (error) {
  console.error('Fetch failed:', error)
  toast.error('Failed to load data')
  return null
}

// ❌ Ignore errors
const result = await fetch(url)
return await result.json()
```

### Code Comments

```typescript
// ✅ Explain WHY, not WHAT
// Filter out duplicate accounts because the API returns them
const uniqueAccounts = accounts.filter((a, i) => accounts.indexOf(a) === i)

// ❌ Obvious comments
// Loop through accounts
accounts.forEach((account) => {
  // Update account
  updateAccount(account)
})
```

---

## 📚 Learning Resources

### Official Documentation

- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

### Development Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Commit with clear messages: `git commit -m "Add export feature"`
4. Push: `git push origin feature/my-feature`
5. Create Pull Request on GitHub
6. Get code review
7. Merge after approval

---

## 🎯 Performance Optimization

### React.memo for Components

```typescript
// Prevent re-renders when props haven't changed
export default memo(AccountsList)
```

### useCallback for Functions

```typescript
// Prevent function recreation
const handleEdit = useCallback((id) => {
  // Edit logic
}, [])
```

### useMemo for Expensive Computations

```typescript
// Cache calculation result
const memoizedFilter = useMemo(() => applyFilters(data, filters), [data, filters])
```

### Lazy Loading Components

```typescript
// Load component only when needed
const HeavyComponent = dynamic(() => import('./Heavy'))
```

---

## 🔄 Common Patterns

### Pagination Pattern

```typescript
const [page, setPage] = useState(1)
const limit = 50

const handleNextPage = () => setPage((p) => p + 1)
const handlePrevPage = () => setPage((p) => Math.max(1, p - 1))

// Fetch data
useEffect(() => {
  fetchData((page - 1) * limit, limit)
}, [page])
```

### Search Filter Pattern

```typescript
const [search, setSearch] = useState('')
const [filtered, setFiltered] = useState(data)

useEffect(() => {
  setFiltered(data.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())))
}, [search, data])
```

### Modal Pattern

```typescript
const [isOpen, setIsOpen] = useState(false)

return (
  <>
    <button onClick={() => setIsOpen(true)}>Open</button>
    {isOpen && (
      <Modal onClose={() => setIsOpen(false)}>
        <ModalContent />
      </Modal>
    )}
  </>
)
```

---

**Last Updated**: June 2026

For questions or updates, check the [GitHub repository](https://github.com/PiyamDev1/pt-portal)

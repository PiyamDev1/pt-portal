# 🏗️ Architecture & Development Guide

## Technical Architecture of PT-Portal

This guide explains the technical structure, how components work together, and how to develop new features.

---

## 🏛️ Overall Architecture

PT-Portal is built using **Next.js 14** with modern React patterns:

```
┌─────────────────────────────────────────────────────┐
│              Client Browser Layer                   │
│  (React Components, TypeScript, Tailwind CSS)       │
└────────────┬────────────────────────────────────────┘
             │
             │ API Requests
             │
┌────────────▼────────────────────────────────────────┐
│         Next.js API Routes Layer                    │
│  (Backend endpoints, data processing)               │
└────────────┬────────────────────────────────────────┘
             │
             │ Database Queries
             │
┌────────────▼────────────────────────────────────────┐
│       Supabase Cloud Database                       │
│  (PostgreSQL, Real-time, Auth)                      │
└─────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure Explained

### `/app` - Next.js Application
```
app/
├── api/                          # API endpoints
│   ├── admin/                    # Admin operations
│   ├── auth/                     # Authentication
│   ├── nadra/                    # NADRA services
│   ├── passports/                # Passport services
│   ├── visas/                    # Visa services
│   └── lms/                      # Loan management
│
├── components/                   # Reusable React components
│   ├── PageHeader.client.tsx
│   ├── SessionWarningHeader.tsx
│   └── ... other shared components
│
├── dashboard/                    # Dashboard pages
│   ├── page.tsx                  # Main dashboard
│   ├── account/                  # User account settings
│   ├── applications/             # Application management
│   │   ├── nadra/
│   │   ├── passports/
│   │   └── visa/
│   ├── lms/                      # Loan management system
│   ├── pricing/                  # Pricing management
│   └── settings/                 # Settings & admin
│
├── hooks/                        # Custom React hooks
│   ├── useLmsData.ts            # Loan data fetching
│   ├── usePricingOptions.ts     # Pricing state management
│   └── ... other hooks
│
├── lib/                          # Utilities & helpers
│   ├── errorHandler.ts          # Error handling
│   ├── pricingOptions.ts        # Pricing constants
│   └── ... other utilities
│
├── types/                        # TypeScript type definitions
│   ├── pricing.ts               # Pricing types
│   ├── application.ts           # Application types
│   └── ... other types
│
├── auth/                         # Authentication pages
│   ├── login/
│   └── setup-2fa/
│
├── layout.tsx                    # Root layout
├── page.tsx                      # Home page
└── globals.css                   # Global styles
```

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
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(...)
  const { data } = await supabase.auth.getSession()
  
  return <div>Welcome {data.session?.user.email}</div>
}
```

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
  accounts,      // Array of accounts
  loading,       // Is loading?
  error,         // Error message
  total,         // Total account count
  currentPage,   // Current page number
  fetchAccounts, // Manual fetch function
  setFilter,     // Update search filter
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
  nadraPricing,    // Array of NADRA prices
  pkPassPricing,   // Array of Pakistan passport prices
  gbPassPricing,   // Array of GB passport prices
  visaPricing,     // Array of visa prices
  editingId,       // Currently editing ID
  editValues,      // Edit form values
  fetchPricing,    // Fetch all pricing data
  handleEdit,      // Start editing
  handleSave,      // Save changes
  handleDelete,    // Delete pricing entry
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
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

export async function GET(req) {
  // 1. Create Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  try {
    // 2. Authenticate
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 3. Get parameters from URL
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // 4. Query database
    const { data, error, count } = await supabase
      .from('accounts')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)

    if (error) throw error

    // 5. Return response
    return NextResponse.json({
      data,
      total: count,
      page,
      limit
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
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
| Class | Effect |
|-------|--------|
| `px-4 py-2` | Padding |
| `rounded` | Border radius |
| `bg-blue-600` | Background color |
| `text-white` | Text color |
| `hover:bg-blue-700` | Hover effect |
| `flex items-center justify-between` | Flexbox layout |
| `grid grid-cols-3 gap-4` | Grid layout |
| `md:flex lg:grid` | Responsive design |
| `animate-spin` | Animation |
| `opacity-50` | Transparency |

---

## 🔐 Authentication & Authorization

### Authentication Flow
```
1. User visits /login
2. Enters email/password
3. Supabase verifies credentials
4. Session token created
5. Token stored in HTTP-only cookie (secure)
6. User redirected to dashboard
7. On protected pages: session verified server-side
8. If no session: redirect to /login
```

### Protected Pages
```typescript
// Server component - check auth
export default async function ProtectedPage() {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    redirect('/login')  // Force login
  }
  
  return <Content userId={session.user.id} />
}
```

### Authorization Levels
| Level | Permissions |
|-------|-------------|
| **User** | View own data, edit own applications |
| **Manager** | Manage team data, change statuses |
| **Admin** | All access, system configuration |

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
console.timeEnd('render')  // Shows milliseconds
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
**File:** `app/hooks/useExportAccounts.ts`
```typescript
export const useExportAccounts = () => {
  const [exporting, setExporting] = useState(false)
  
  const exportToExcel = async (accountIds) => {
    setExporting(true)
    const response = await fetch('/api/accounts/export', {
      method: 'POST',
      body: JSON.stringify({ ids: accountIds })
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

import { useExportAccounts } from '@/app/hooks/useExportAccounts'

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
const uniqueAccounts = accounts.filter((a, i) => 
  accounts.indexOf(a) === i
)

// ❌ Obvious comments
// Loop through accounts
accounts.forEach(account => {
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
const memoizedFilter = useMemo(() => 
  applyFilters(data, filters),
  [data, filters]
)
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

const handleNextPage = () => setPage(p => p + 1)
const handlePrevPage = () => setPage(p => Math.max(1, p - 1))

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
  setFiltered(
    data.filter(item =>
      item.name.toLowerCase().includes(search.toLowerCase())
    )
  )
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

**Last Updated**: February 2026

For questions or updates, check the [GitHub repository](https://github.com/PiyamDev1/pt-portal)

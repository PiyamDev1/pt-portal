# Centralized Constants

This directory contains all application constants, organized by category.

## Structure

```
lib/constants/
├── api.ts        # API endpoints and HTTP constants
├── validation.ts # Validation rules and error messages
├── ui.ts         # UI constants: colors, spacing, sizes
└── index.ts      # Barrel export for easy imports
```

## Usage

### Import from Barrel Export
```tsx
import { API_ENDPOINTS, VALIDATION_MESSAGES, COLORS } from '@/lib/constants'
```

### Or Import Individually
```tsx
import { API_ENDPOINTS } from '@/lib/constants/api'
import { VALIDATION_MESSAGES } from '@/lib/constants/validation'
import { COLORS } from '@/lib/constants/ui'
```

---

## api.ts

Contains all API endpoints and HTTP-related constants.

### API Endpoints
Organized by feature:

```tsx
API_ENDPOINTS = {
  // Admin APIs
  ADMIN: {
    USER: '/api/admin/users',
    SETTINGS: '/api/admin/settings',
  },
  
  // Auth APIs
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
  },
  
  // Application APIs
  APPLICATIONS: {
    NADRA: '/api/applications/nadra',
    PASSPORTS: '/api/applications/passports',
    VISAS: '/api/applications/visas',
  },
  
  // ... more endpoints
}
```

### HTTP Status Codes
```tsx
HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  // ... more
}
```

### Pagination
```tsx
PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 500,
  DEFAULT_PAGE: 1,
}
```

### Timeouts
```tsx
TIMEOUT = {
  DEFAULT: 30000,    // 30 seconds
  LONG: 60000,       // 60 seconds
  SHORT: 5000,       // 5 seconds
}
```

### Usage Example
```tsx
import { API_ENDPOINTS, HTTP_STATUS } from '@/lib/constants'

// Fetch data
const res = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
  method: 'POST',
  body: JSON.stringify({ email, password }),
  timeout: TIMEOUT.DEFAULT,
})

// Check status
if (res.status === HTTP_STATUS.UNAUTHORIZED) {
  // Handle auth error
}
```

---

## validation.ts

Contains all validation rules and error messages.

### Validation Rules
```tsx
VALIDATION_RULES = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[0-9]{10,}$/,
  URL: /^https?:\/\/.+/,
  STRONG_PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
}

// Usage
if (!VALIDATION_RULES.EMAIL.test(email)) {
  setError('Invalid email address')
}
```

### Validation Messages
Pre-defined error messages for consistency:

```tsx
VALIDATION_MESSAGES = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_PHONE: 'Please enter a valid phone number',
  INVALID_URL: 'Please enter a valid URL',
  WEAK_PASSWORD: 'Password must contain uppercase, lowercase, number, and special character',
  MIN_LENGTH: (min) => `Must be at least ${min} characters`,
  MAX_LENGTH: (max) => `Must be no more than ${max} characters`,
  // ... more
}
```

### Error Codes
```tsx
ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  NOT_FOUND: 'NOT_FOUND',
}
```

### Usage Example
```tsx
import { VALIDATION_RULES, VALIDATION_MESSAGES } from '@/lib/constants'

function validateEmail(email) {
  if (!VALIDATION_RULES.EMAIL.test(email)) {
    return VALIDATION_MESSAGES.INVALID_EMAIL
  }
  return null
}

const error = validateEmail('invalid-email')
if (error) {
  console.log(error) // "Please enter a valid email address"
}
```

---

## ui.ts

Contains all UI-related constants.

### Colors
```tsx
COLORS = {
  PRIMARY: '#3B82F6',      // Blue
  SECONDARY: '#8B5CF6',    // Purple
  SUCCESS: '#10B981',      // Green
  WARNING: '#F59E0B',      // Amber
  DANGER: '#EF4444',       // Red
  GRAY: '#6B7280',         // Gray
  // ... more color variants
}
```

### Sizes
```tsx
SIZES = {
  XS: '320px',
  SM: '384px',
  MD: '448px',
  LG: '512px',
  XL: '640px',
  '2XL': '768px',
}
```

### Spacing
```tsx
SPACING = {
  '0': '0px',
  '1': '0.25rem',      // 4px
  '2': '0.5rem',       // 8px
  '3': '0.75rem',      // 12px
  '4': '1rem',         // 16px
  '5': '1.25rem',      // 20px
  '6': '1.5rem',       // 24px
  '8': '2rem',         // 32px
  '10': '2.5rem',      // 40px
  '12': '3rem',        // 48px
}
```

### Z-Index
```tsx
Z_INDEX = {
  DROPDOWN: 10,
  STICKY: 20,
  FIXED: 30,
  MODAL_BACKDROP: 40,
  MODAL: 50,
  TOAST: 60,
  TOOLTIP: 70,
}
```

### Common CSS Classes
```tsx
COMMON_CLASSES = {
  BUTTON_PRIMARY: 'bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50',
  BUTTON_SECONDARY: 'bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300',
  BUTTON_DANGER: 'bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700',
  INPUT: 'border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
  CARD: 'bg-white rounded-lg shadow p-4',
}
```

### Shadows
```tsx
SHADOWS = {
  SM: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  MD: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  LG: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  XL: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
}
```

### Breakpoints
```tsx
BREAKPOINTS = {
  SM: 640,   // Small laptops
  MD: 768,   // Tablets
  LG: 1024,  // Desktops
  XL: 1280,  // Large desktops
}
```

### Usage Example
```tsx
import { COLORS, COMMON_CLASSES, Z_INDEX } from '@/lib/constants'

// Use in JSX
<button className={COMMON_CLASSES.BUTTON_PRIMARY}>
  Save
</button>

// Use in inline styles
<div style={{
  backgroundColor: COLORS.SUCCESS,
  zIndex: Z_INDEX.MODAL,
}}>
  Success Message
</div>

// Use in Tailwind
<button className={`px-4 py-2 rounded ${
  isActive ? 'bg-blue-600' : 'bg-gray-200'
}`}>
  Toggle
</button>
```

---

## index.ts (Barrel Export)

Consolidates all exports for convenient importing:

```tsx
// Single import, all constants available
import { 
  API_ENDPOINTS, 
  VALIDATION_RULES, 
  COLORS 
} from '@/lib/constants'
```

---

## Adding New Constants

### Step 1: Identify Category
Determine if the constant belongs to existing file or needs a new one.

### Step 2: Add to Appropriate File
```tsx
// lib/constants/ui.ts
export const NEW_CONSTANT = 'value'
```

### Step 3: Update Barrel Export
```tsx
// lib/constants/index.ts
export { NEW_CONSTANT } from './ui'
```

### Step 4: Document in README
Add usage example in this file.

---

## Best Practices

### ✅ Do:
- Keep constants organized by category
- Use UPPER_SNAKE_CASE for constant names
- Group related constants together
- Provide clear variable names
- Document complex constants
- Export from barrel file for consistency

### ❌ Don't:
- Mix unrelated constants in one category
- Use magic numbers or strings in components
- Duplicate constants across files
- Create constants that might need frequent updates
- Over-engineer constant structure

---

## Examples

### Authentication Flow
```tsx
import { API_ENDPOINTS, HTTP_STATUS, TIMEOUT } from '@/lib/constants'

async function login(email, password) {
  const res = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    timeout: TIMEOUT.DEFAULT,
  })
  
  if (res.status === HTTP_STATUS.UNAUTHORIZED) {
    throw new Error('Invalid credentials')
  }
  
  return res.json()
}
```

### Form Validation
```tsx
import { VALIDATION_RULES, VALIDATION_MESSAGES } from '@/lib/constants'

function validateForm(data) {
  const errors = {}
  
  if (!VALIDATION_RULES.EMAIL.test(data.email)) {
    errors.email = VALIDATION_MESSAGES.INVALID_EMAIL
  }
  
  if (data.phone && !VALIDATION_RULES.PHONE.test(data.phone)) {
    errors.phone = VALIDATION_MESSAGES.INVALID_PHONE
  }
  
  return Object.keys(errors).length === 0 ? null : errors
}
```

### UI Styling
```tsx
import { COLORS, COMMON_CLASSES, Z_INDEX } from '@/lib/constants'

export function NotificationPanel() {
  return (
    <div 
      style={{ 
        backgroundColor: COLORS.SUCCESS,
        zIndex: Z_INDEX.TOAST,
      }}
      className={COMMON_CLASSES.CARD}
    >
      Message sent successfully!
    </div>
  )
}
```

---

## Maintenance

### Regular Reviews
Quarterly reviews to:
- Remove unused constants
- Consolidate duplicates
- Update outdated values
- Gather team feedback

### Backward Compatibility
When removing constants, maintain through deprecation period.

### Version Control
Track significant constant changes in commit messages for easy tracking.


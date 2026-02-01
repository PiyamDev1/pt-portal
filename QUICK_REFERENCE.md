# ⚡ Quick Reference Guide

## One-Page Reference for PT-Portal

---

## 🚀 Getting Started (Copy-Paste Commands)

### Windows Users - Complete Setup
```powershell
# 1. Clone project
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal

# 2. Install dependencies
npm install

# 3. Create environment file
copy .env.example .env.local

# 4. Open in VS Code
code .

# 5. Start dev server
npm run dev

# 6. Open browser
start http://localhost:3000
```

### Mac/Linux Users - Complete Setup
```bash
# 1. Clone project
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local

# 4. Open in VS Code
code .

# 5. Start dev server
npm run dev

# 6. Open browser
open http://localhost:3000
```

---

## 🔑 Environment Variables Template

Create `.env.local` file:
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get these from [Supabase Dashboard](https://supabase.com/dashboard) > Settings > API

---

## 📚 Documentation Quick Links

| Need | Document |
|------|----------|
| **First time using app?** | [USAGE_GUIDE.md](USAGE_GUIDE.md) |
| **Setting up on Windows?** | [WINDOWS_SETUP_GUIDE.md](WINDOWS_SETUP_GUIDE.md) |
| **Understanding the code?** | [ARCHITECTURE_GUIDE.md](ARCHITECTURE_GUIDE.md) |
| **Troubleshooting issues?** | [WINDOWS_SETUP_GUIDE.md#-common-issues--solutions](WINDOWS_SETUP_GUIDE.md#-common-issues--solutions) |
| **Performance details?** | [PAYMENT_SERVICE_OPTIMIZATION.md](PAYMENT_SERVICE_OPTIMIZATION.md) |

---

## 🛠️ Common Commands

```bash
npm run dev              # Start development (port 3000)
npm run build           # Build for production
npm start               # Start production server
npm run lint            # Check code quality
npm run format          # Auto-format code
npm run type-check      # Check TypeScript types

# Restart on issues
npm install             # Reinstall dependencies
rm -rf .next            # Clear Next.js cache
npm cache clean         # Clear npm cache
```

---

## 🔍 File Locations

### Important Files

| File | Purpose |
|------|---------|
| `.env.local` | Your secret API keys (never commit!) |
| `app/page.tsx` | Home page |
| `app/dashboard/page.tsx` | Main dashboard |
| `app/api/` | Backend API endpoints |
| `app/components/` | Reusable React components |
| `app/hooks/` | Custom React hooks |
| `app/lib/` | Utility functions |
| `next.config.js` | Next.js configuration |
| `tailwind.config.js` | Tailwind CSS setup |
| `tsconfig.json` | TypeScript configuration |

---

## 🎯 Common Tasks

### Create a New API Endpoint
```typescript
// app/api/my-endpoint/route.ts
import { NextResponse } from 'next/server'

export async function GET(req) {
  try {
    // Your code here
    return NextResponse.json({ data: [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Create a New Page
```typescript
// app/dashboard/my-page/page.tsx
'use client'

import { useState } from 'react'

export default function MyPage() {
  const [data, setData] = useState([])
  
  return <div>My Page</div>
}
```

### Create a Custom Hook
```typescript
// app/hooks/useMyData.ts
import { useState, useEffect } from 'react'

export function useMyData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // Fetch data
    setLoading(false)
  }, [])
  
  return { data, loading }
}
```

---

## 🧪 Testing Your Code

### Run Build (Tests Everything)
```bash
npm run build
```

### Check for TypeScript Errors
```bash
npm run type-check
```

### Check Code Quality
```bash
npm run lint
```

### Format Code
```bash
npm run format
```

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| **Port 3000 in use** | `npm run dev -- -p 3001` |
| **npm not found** | Reinstall Node.js |
| **Dependencies error** | `npm install` (or `npm ci` for exact versions) |
| **Env variables not working** | Restart dev server (`Ctrl+C` then `npm run dev`) |
| **Git conflicts** | `git pull origin main` then resolve conflicts |
| **Build fails** | `rm -rf .next node_modules` then `npm install` and `npm run build` |

---

## 🎨 Tailwind CSS Cheat Sheet

### Common Classes
```typescript
// Spacing
px-4 py-2          // Horizontal & vertical padding
m-4 mt-2           // Margin

// Colors
bg-blue-600        // Background color
text-white         // Text color
border-gray-200    // Border color

// Sizing
w-full h-screen    // Width & height
min-h-screen       // Minimum height

// Layout
flex flex-col      // Flexbox
grid grid-cols-3   // Grid layout
justify-center     // Center items
items-center       // Center vertically

// Responsive
md:flex lg:block    // Different styles per screen size
hidden md:block     // Hide on mobile, show on desktop

// Effects
hover:bg-blue-700  // Hover effect
transition          // Smooth transition
opacity-50         // Transparency
rounded-lg         // Border radius
shadow-lg          // Box shadow

// Typography
font-bold          // Bold text
text-lg            // Font size
underline          // Underline
```

---

## 📱 Responsive Design Breakpoints

```typescript
// Tailwind breakpoints (prefix with `md:`, `lg:`, etc.)
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px

// Example
<div className="flex md:hidden">Mobile only</div>
<div className="hidden md:flex">Desktop only</div>
```

---

## 🔐 Security Best Practices

✅ DO:
- Keep `.env.local` in `.gitignore`
- Use HTTPS in production
- Validate all inputs
- Use strong passwords
- Never commit secrets

❌ DON'T:
- Commit `.env.local` files
- Use `admin` keys in client code
- Log sensitive data
- Disable authentication checks
- Skip validation

---

## 📊 Database Tables Reference

### Quick Query Examples

**Get all accounts:**
```javascript
const { data } = await supabase.from('accounts').select('*')
```

**Filter by status:**
```javascript
const { data } = await supabase
  .from('applications')
  .select('*')
  .eq('status', 'approved')
```

**Get recent transactions:**
```javascript
const { data } = await supabase
  .from('transactions')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10)
```

---

## 🐛 Debugging in Browser

### Open Developer Tools
- **Windows/Linux**: `F12` or `Ctrl+Shift+I`
- **Mac**: `Cmd+Option+I`

### Tabs to Check
| Tab | Use |
|-----|-----|
| **Console** | See errors and logs |
| **Network** | See API calls, responses |
| **Elements** | Inspect HTML structure |
| **Application** | Check cookies, storage |

### Debug React Components
1. Install React Developer Tools extension
2. Open DevTools (F12)
3. Go to "React" tab
4. Inspect component tree
5. See props and state

---

## 💡 Code Snippets

### Fetch Data from API
```typescript
async function getData() {
  try {
    const response = await fetch('/api/endpoint')
    if (!response.ok) throw new Error('API error')
    return await response.json()
  } catch (error) {
    console.error(error)
  }
}
```

### Form Handling
```typescript
const [formData, setFormData] = useState({ name: '', email: '' })

const handleChange = (e) => {
  setFormData({ 
    ...formData, 
    [e.target.name]: e.target.value 
  })
}

const handleSubmit = (e) => {
  e.preventDefault()
  console.log(formData)
}
```

### Loading State
```typescript
const [loading, setLoading] = useState(false)

const handleClick = async () => {
  setLoading(true)
  try {
    // Do something async
  } finally {
    setLoading(false)
  }
}

return <button disabled={loading}>{loading ? 'Loading...' : 'Submit'}</button>
```

---

## 🔗 Useful Links

### Documentation
- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/)

### Tools
- [VS Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [Supabase Dashboard](https://supabase.com/dashboard)

### Resources
- [MDN Web Docs](https://developer.mozilla.org/)
- [CSS Tricks](https://css-tricks.com/)
- [Dev.to](https://dev.to/)
- [Stack Overflow](https://stackoverflow.com/)

---

## 📝 Git Commands

```bash
# Check status
git status

# Add files
git add .
git add app/  # specific folder

# Commit
git commit -m "Your message here"

# Push to GitHub
git push origin main

# Pull updates
git pull origin main

# Create new branch
git checkout -b feature/my-feature

# Switch branch
git checkout main

# Delete branch
git branch -d feature/my-feature
```

---

## ✅ Setup Verification Checklist

After completing setup:

- [ ] Project cloned successfully
- [ ] `npm install` completed without errors
- [ ] `.env.local` file created with Supabase credentials
- [ ] Database tables created in Supabase
- [ ] `npm run dev` starts without errors
- [ ] Can access http://localhost:3000
- [ ] Login page visible
- [ ] Can navigate to dashboard pages

---

## 📞 Need Help?

1. **Check the guide** relevant to your issue:
   - User help → [USAGE_GUIDE.md](USAGE_GUIDE.md)
   - Setup help → [WINDOWS_SETUP_GUIDE.md](WINDOWS_SETUP_GUIDE.md)
   - Dev help → [ARCHITECTURE_GUIDE.md](ARCHITECTURE_GUIDE.md)

2. **Search GitHub Issues** → [pt-portal/issues](https://github.com/PiyamDev1/pt-portal/issues)

3. **Create a new issue** with:
   - What you tried
   - What happened
   - Error message (if any)
   - Your OS and Node.js version

---

**Last Updated**: February 2026

**Pro Tip**: Bookmark this page for quick reference! 🔖

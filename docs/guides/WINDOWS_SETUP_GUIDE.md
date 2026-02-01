# 🪟 Windows Setup & Visual Studio Configuration Guide

## Complete Setup for PT-Portal on Windows with Visual Studio Code

This guide walks you through setting up the PT-Portal project on your Windows machine from scratch, including all dependencies and local deployment.

---

## 📋 Prerequisites

Before starting, ensure you have these installed:

### Required Software
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Git** (for version control) - [Download](https://git-scm.com/)
- **Visual Studio Code** - [Download](https://code.visualstudio.com/)
- **Supabase Account** - [Create Free Account](https://supabase.com/)

### Verify Installation
Open PowerShell or Command Prompt and run:
```powershell
node --version
npm --version
git --version
```

You should see version numbers. If not, restart your terminal or computer.

---

## 🚀 Step 1: Clone the Repository

1. Open **PowerShell** or **Command Prompt**
2. Navigate to where you want the project:
   ```powershell
   cd C:\Users\YourName\Documents
   ```
3. Clone the repository:
   ```powershell
   git clone https://github.com/PiyamDev1/pt-portal.git
   cd pt-portal
   ```

---

## 🔧 Step 2: Visual Studio Code Setup

### Install VS Code
1. Download and install [Visual Studio Code](https://code.visualstudio.com/)
2. Open the project folder in VS Code:
   - Open PowerShell in the `pt-portal` folder
   - Type: `code .`
   - Or use File > Open Folder in VS Code

### Essential VS Code Extensions
Install these extensions for better development experience:

1. **ES7+ React/Redux/React-Native snippets**
   - Search: `dsznajder.es7-react-js-snippets`
   - Provides code snippets for React

2. **Prettier - Code formatter**
   - Search: `esbenp.prettier-vscode`
   - Auto-formats your code

3. **ESLint**
   - Search: `dbaeumer.vscode-eslint`
   - Checks code quality

4. **Thunder Client** (Alternative to Postman)
   - Search: `rangav.vscode-thunder-client`
   - Test API endpoints locally

5. **Supabase** (Optional)
   - Search: `supabase.supabase-vscode`
   - Direct database access

### Install Extensions
For each extension:
1. Click the Extensions icon (Ctrl+Shift+X)
2. Search for the extension name
3. Click "Install"

---

## 📦 Step 3: Install Dependencies

1. Open the integrated terminal in VS Code (`` Ctrl+` ``)
2. Run:
   ```powershell
   npm install
   ```

This may take 2-5 minutes. Wait for it to complete. You should see:
```
added XXX packages in XX.XXs
```

---

## 🔐 Step 4: Environment Variables Setup

### Get Your Supabase Credentials
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project or use existing one
3. Go to **Settings > API**
4. Copy these values:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon public)

### Create `.env.local` File
1. In VS Code, create a new file at the root: `.env.local`
2. Add this content (replace with your actual values):

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: If you have a service role key for backend operations
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Keep `.env.local` Secure
- **NEVER** commit `.env.local` to Git
- It's already in `.gitignore` (don't modify this)
- Each developer should have their own copy

---

## 🗄️ Step 5: Database Setup

### Create Pricing Tables
1. Go to your **Supabase Dashboard**
2. Click **SQL Editor** in the left sidebar
3. Click **+ New Query**
4. Open file `scripts/create-pricing-tables.sql` in VS Code
5. Copy all the SQL code
6. Paste it into Supabase SQL Editor
7. Click **RUN**

You should see: ✅ Success messages

### Seed Initial Data (Optional)
Run in terminal:
```powershell
node scripts/setup-direct.js
```

This creates test pricing data.

---

## ▶️ Step 6: Run the Development Server

In VS Code terminal, run:
```powershell
npm run dev
```

You should see:
```
> next dev

  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in XXXms
```

### Access the Application
Open your browser and go to: **http://localhost:3000**

---

## 🧪 Step 7: Testing the Application

### Login Test
1. On the login page, you'll need to create a test account or use existing credentials
2. If it's your first time, you may need to:
   - Use Supabase dashboard to create a test user
   - Or set up authentication properly in Supabase

### Navigate the Application
- **Dashboard**: View loan data, applications, pricing
- **Applications**: NADRA, Passports, Visas, etc.
- **Settings**: Manage pricing and system configuration
- **LMS**: Loan Management System (payment tracking)

---

## 🔨 Development Commands

### Terminal Commands (run in VS Code terminal)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Check code quality |
| `npm run format` | Auto-format code |
| `npm run type-check` | Run TypeScript type checking |
| `npm test` | Run tests (if configured) |

---

## 🛠️ Debugging in VS Code

### Enable Debug Mode
1. Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js Debug",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

2. Press **F5** to start debugging
3. Breakpoints work like normal - click left of line numbers

### Console Logs
Open browser DevTools (F12) to see:
- Console logs
- Network requests
- React component hierarchy

---

## 📁 Project Structure

```
pt-portal/
├── app/
│   ├── api/              # Backend API routes
│   ├── dashboard/        # Dashboard pages
│   │   ├── lms/         # Loan Management System
│   │   ├── applications/
│   │   ├── settings/
│   │   └── pricing/
│   ├── components/       # Reusable React components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions
│   └── types/            # TypeScript type definitions
├── public/               # Static assets (images, icons)
├── scripts/              # Automation scripts
├── .env.local            # Your local environment variables
├── next.config.js        # Next.js configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies
```

---

## 🔍 Common Issues & Solutions

### Issue: "npm: The term 'npm' is not recognized"
**Solution:** Node.js not installed or not in PATH
- Reinstall Node.js from [nodejs.org](https://nodejs.org/)
- Restart PowerShell/Command Prompt

### Issue: "Cannot find module" errors
**Solution:** Dependencies not installed
```powershell
npm install
```

### Issue: "EADDRINUSE: address already in use :::3000"
**Solution:** Another process is using port 3000
```powershell
# Kill the process
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use a different port
npm run dev -- -p 3001
```

### Issue: Environment variables not loading
**Solution:** Restart the dev server
1. Stop the server (Ctrl+C)
2. Restart with `npm run dev`

### Issue: Supabase authentication fails
**Solution:** Check environment variables
1. Open `.env.local`
2. Verify URLs and keys are correct (no extra spaces)
3. Make sure the Supabase project exists and is active

### Issue: Database tables don't exist
**Solution:** Run the SQL setup script
1. Go to Supabase Dashboard > SQL Editor
2. Run `scripts/create-pricing-tables.sql`
3. Verify tables appear in Database > Tables

---

## 🚀 Building for Production

### Local Production Build
Test your app before deploying:

```powershell
# Build the app
npm run build

# Start production server
npm start
```

Visit **http://localhost:3000**

### Pre-deployment Checklist
- [ ] `.env.local` is in `.gitignore` (never commit secrets)
- [ ] All tests pass: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] All API endpoints working

---

## 📱 Testing on Mobile/Other Devices

### Access Dev Server from Network
Find your computer's IP address:
```powershell
ipconfig
```

Look for "IPv4 Address" (usually starts with 192.168 or 10.0)

Then on your mobile device, open:
```
http://<YOUR_IP>:3000
```

---

## 🆘 Getting Help

### Check Logs
1. Look at terminal output in VS Code
2. Open browser DevTools (F12) for JavaScript errors
3. Check Supabase dashboard for API errors

### Common Resources
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Supabase Docs](https://supabase.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Project cloned successfully
- [ ] Dependencies installed (`npm install` completed)
- [ ] VS Code extensions installed
- [ ] `.env.local` file created with correct values
- [ ] Database tables created in Supabase
- [ ] Dev server runs without errors (`npm run dev`)
- [ ] Can access http://localhost:3000
- [ ] Login page appears
- [ ] Can navigate through dashboard pages

If all items are checked, you're ready to develop! 🎉

---

## 📝 Next Steps

1. **Explore the codebase**: Start in `app/dashboard/` to understand page structure
2. **Read USAGE_GUIDE.md**: Learn how to use the application
3. **Check existing issues**: Look at GitHub Issues for features/bugs
4. **Start developing**: Make changes and test locally

Happy coding! 🚀

# 🌐 PT-Portal

> **Developed by Rathobixz Inc.**

A comprehensive web application for managing travel services, passport applications, visa processing, and loan management. Built with Next.js, React, and Supabase.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)](https://react.dev)
[![Made by Rathobixz](https://img.shields.io/badge/Made%20by-Rathobixz%20Inc.-blue)](https://rathobixz.com)

---

## 📖 Quick Start

### For Users

- **New to PT-Portal?** Start with [docs/guides/USAGE_GUIDE.md](docs/guides/USAGE_GUIDE.md) to learn how to use all features

### For Developers

- **Setting up on Windows?** Follow [docs/guides/WINDOWS_SETUP_GUIDE.md](docs/guides/WINDOWS_SETUP_GUIDE.md)
- **Want to understand the code?** Read [docs/guides/ARCHITECTURE_GUIDE.md](docs/guides/ARCHITECTURE_GUIDE.md)
- **Running locally?** See [Local Development](#local-development) below

---

## ✨ Features

### 📋 Application Management

- **NADRA Services**: CNICs, family registration, forms, and official reports
- **Passport Services**: Pakistani and UK passport applications
- **Visa Services**: Visa applications with document management
- **Status Tracking**: Real-time status updates for all applications

### 💰 Loan Management System (LMS)

- **Account Management**: View customer accounts and balances
- **Payment Processing**: Track payments with multiple payment methods
- **Installment Plans**: Create and manage payment plans
- **Transaction History**: Complete payment and charge history

### 💵 Pricing Management

- **Dynamic Pricing**: Configure prices for all services
- **Cost Tracking**: Manage cost prices and profit margins
- **Service Options**: Add custom service variations
- **Price History**: Track price changes over time

### 👥 User & Admin Features

- **Role-Based Access**: Admin, Manager, and User roles
- **Employee Management**: Add and manage team members
- **Branch Management**: Manage multiple branch locations
- **Security Features**: 2FA, session management, audit logs

---

## 🛠️ Tech Stack

| Layer                | Technology                                     |
| -------------------- | ---------------------------------------------- |
| **Frontend**         | React 18, TypeScript, Next.js 14, Tailwind CSS |
| **Backend**          | Next.js API Routes, Node.js                    |
| **Database**         | Supabase (PostgreSQL)                          |
| **Authentication**   | Supabase Auth                                  |
| **UI Components**    | Custom components, Lucide Icons                |
| **State Management** | React Hooks, Custom Hooks                      |
| **Deployment**       | Vercel (recommended)                           |

---

## 🚀 Local Development

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- Git ([Download](https://git-scm.com/))
- VS Code ([Download](https://code.visualstudio.com/))

### Quick Setup (5 minutes)

1. **Clone Repository**

   ```bash
   git clone https://github.com/PiyamDev1/pt-portal.git
   cd pt-portal
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Setup Environment Variables**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your Supabase credentials:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_url_here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
   ```

4. **Setup Database**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Open SQL Editor
   - Run SQL from `scripts/create-pricing-tables.sql`

5. **Start Development Server**
   ```bash
   npm run dev
   ```
   Visit: http://localhost:3000

### Available Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Check code quality
npm run format       # Format code with Prettier
npm run type-check   # Check TypeScript types
```

---

## 📚 Documentation

All documentation is organized in the `docs/` directory:

### User Documentation

- **[docs/guides/USAGE_GUIDE.md](docs/guides/USAGE_GUIDE.md)** - Complete guide to using all features
  - Dashboard navigation
  - Application management
  - Payment processing
  - Pricing configuration
  - Best practices and tips

### Developer Documentation

- **[docs/guides/WINDOWS_SETUP_GUIDE.md](docs/guides/WINDOWS_SETUP_GUIDE.md)** - Windows setup with VS Code
  - Step-by-step installation
  - Environment setup
  - Common issues and solutions
  - Debugging guide

- **[docs/guides/ARCHITECTURE_GUIDE.md](docs/guides/ARCHITECTURE_GUIDE.md)** - Technical deep dive
  - System architecture
  - Component structure
  - Data flow patterns
  - Custom hooks
  - API development
  - Database schema
  - Performance optimization

- **[docs/guides/QUICK_REFERENCE.md](docs/guides/QUICK_REFERENCE.md)** - Command cheat sheet
  - Common commands
  - Code snippets
  - Quick troubleshooting

- **[docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md)** - Onboarding checklists
  - Role-based guides
  - Setup verification
  - Learning paths

### Codebase Refactoring & Cleanup

These documents guide the ongoing refactoring efforts:

- **[CODEBASE_STRUCTURE_GUIDE.md](CODEBASE_STRUCTURE_GUIDE.md)** - New modular structure
  - Extracted hooks and components
  - Centralized constants
  - Import best practices
  - Component patterns and templates

- **[CODEBASE_REFACTORING_PLAN.md](CODEBASE_REFACTORING_PLAN.md)** - Overall refactoring strategy
  - Priority matrix with effort estimates
  - Phase-by-phase implementation plan
  - Risk mitigation strategies
  - Success metrics

- **[CODEBASE_CLEANUP_GUIDE.md](CODEBASE_CLEANUP_GUIDE.md)** - Code quality standards
  - File organization standards
  - Code quality checklist
  - Common cleanup tasks
  - Maintenance schedule

- **[hooks/README.md](hooks/README.md)** - Custom hooks documentation
  - `useAsync` - Async operations
  - `useModal` - Modal state management
  - `usePagination` - Pagination logic
  - `useFormState` - Form state management
  - `useTableFilters` - Table filtering and sorting

- **[components/README.md](components/README.md)** - Reusable components
  - `ModalBase` - Consistent modal wrapper
  - `ConfirmationDialog` - Deletion/warning dialogs
  - Usage patterns and examples

- **[lib/constants/README.md](lib/constants/README.md)** - Constants organization
  - API endpoints
  - Validation rules and messages
  - UI constants (colors, spacing, sizes)

### Technical Documentation

- **[docs/technical/PAYMENT_SERVICE_OPTIMIZATION.md](docs/technical/PAYMENT_SERVICE_OPTIMIZATION.md)** - LMS optimizations
  - Backend pagination
  - Query optimization
  - O(1) lookup implementation
  - Memory usage reduction

- **[docs/technical/REFRESH_LOOP_FIX_SUMMARY.md](docs/technical/REFRESH_LOOP_FIX_SUMMARY.md)** - Performance improvements
  - Infinite refresh loop diagnosis
  - React.memo optimization
  - Hook memoization patterns
  - Effect dependency optimization

- **[docs/technical/](docs/technical/)** - Additional technical docs
  - Build performance
  - Code quality reports
  - Bundle analysis

---

## 📁 Project Structure

```
pt-portal/
├── app/
│   ├── api/                      # API routes
│   ├── dashboard/                # Dashboard pages
│   ├── auth/                     # Authentication pages
│   ├── components/               # Reusable components
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utility functions and constants
│   │   ├── constants/            # Centralized constants (NEW)
│   │   │   ├── api.ts           # API endpoints
│   │   │   ├── validation.ts    # Validation rules
│   │   │   ├── ui.ts            # UI constants
│   │   │   └── index.ts         # Barrel export
│   │   └── ...
│   ├── types/                    # TypeScript types
│   └── layout.tsx               # Root layout
├── components/                   # Shared UI components (NEW)
│   ├── ModalBase.tsx            # Reusable modal
│   ├── ConfirmationDialog.tsx   # Confirmation dialog
│   └── index.ts                 # Barrel export
├── hooks/                        # Shared hooks (NEW)
│   ├── useAsync.ts              # Async operations hook
│   ├── useModal.ts              # Modal state hook
│   ├── usePagination.ts         # Pagination hook
│   ├── useFormState.ts          # Form state hook
│   ├── useTableFilters.ts       # Table filtering hook
│   └── index.ts                 # Barrel export
├── public/                       # Static assets
├── scripts/                      # Setup and utility scripts
├── docs/                         # User and developer documentation
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── next.config.js
├── CODEBASE_STRUCTURE_GUIDE.md   # New module guide (NEW)
├── CODEBASE_REFACTORING_PLAN.md  # Refactoring roadmap (NEW)
└── CODEBASE_CLEANUP_GUIDE.md     # Code quality guide (NEW)
```

---

## 🔐 Security

- **Authentication**: Supabase Auth with email/password
- **Authorization**: Role-based access control (Admin/Manager/User)
- **Data Protection**: HTTPS, secure cookies, encrypted passwords
- **2FA Support**: Two-factor authentication available
- **Audit Logging**: All user actions logged
- **Environment Variables**: Secrets in `.env.local` (never committed)

---

## 📈 Performance

Recent optimizations achieved:

- **90% Memory Reduction**: From 500MB to 50MB
- **15x Faster Loading**: Initial load 15-30s → 1-2s
- **Zero Idle API Calls**: Eliminated unnecessary requests
- **Smooth Pagination**: Handles 10,000+ accounts without lag

---

## 🆘 Troubleshooting

### Can't log in?

1. Check email and password
2. Verify Supabase project is active
3. Check environment variables in `.env.local`

### Port 3000 already in use?

```bash
npm run dev -- -p 3001
```

### Database tables missing?

1. Go to Supabase Dashboard
2. Run SQL from `scripts/create-pricing-tables.sql`

### Need help?

- Check [WINDOWS_SETUP_GUIDE.md](WINDOWS_SETUP_GUIDE.md#-common-issues--solutions)
- Read [ARCHITECTURE_GUIDE.md](ARCHITECTURE_GUIDE.md) for technical details
- Open an issue on [GitHub](https://github.com/PiyamDev1/pt-portal/issues)

---

## 📊 Key Metrics

| Metric            | Value                |
| ----------------- | -------------------- |
| **Bundle Size**   | ~200KB (gzipped)     |
| **Performance**   | 95+ Lighthouse score |
| **Load Time**     | < 2 seconds          |
| **Accessibility** | WCAG 2.1 AA          |
| **Type Safety**   | 99% TypeScript       |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Write/update tests
5. Commit with clear messages: `git commit -m "Add my feature"`
6. Push: `git push origin feature/my-feature`
7. Create a Pull Request

Please follow the existing code style and include appropriate documentation.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 👨‍💻 Author

**Rathobixz Inc.**

- Company: [Rathobixz Inc.](https://rathobixz.com)
- GitHub: [@PiyamDev1](https://github.com/PiyamDev1)
- Project: PT-Portal - Travel & Document Management System

---

## 🔗 Links

- **Live Demo**: [https://ptportal.vercel.app](https://ptportal.vercel.app)
- **GitHub Repository**: [PiyamDev1/pt-portal](https://github.com/PiyamDev1/pt-portal)
- **Issue Tracker**: [GitHub Issues](https://github.com/PiyamDev1/pt-portal/issues)
- **Documentation**: [docs/](docs/)
- **Company**: [Rathobixz Inc.](https://rathobixz.com)

---

## 📞 Support

- **Company**: Rathobixz Inc.
- **Email**: support@ptportal.com
- **Documentation**: Check [docs/guides/](docs/guides/)
- **GitHub Issues**: Report bugs or request features

---

**Last Updated**: February 2026 | **Version**: 2.0.0

---

**© 2026 Rathobixz Inc. All rights reserved.**

Made with ❤️ by Rathobixz Inc.

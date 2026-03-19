# PT-Portal Documentation

> **By Rathobixz Inc.** — Last updated March 2026

---

## Documentation Structure

```
docs/
├── guides/
│   ├── ARCHITECTURE_GUIDE.md          ← System architecture & data flow
│   ├── DOCUMENT_MANAGEMENT_GUIDE.md   ← Document system (upload, preview, storage)
│   ├── GETTING_STARTED.md             ← Developer onboarding
│   ├── QUICK_REFERENCE.md             ← Command cheat sheet
│   ├── USAGE_GUIDE.md                 ← End-user manual
│   └── WINDOWS_SETUP_GUIDE.md        ← Windows dev setup
│
└── technical/
    ├── STORAGE_SYSTEM.md              ← MinIO + R2 dual-storage deep dive
    ├── SECURITY.md                    ← Auth, rate limiting, 2FA
    ├── API_REFERENCE.md               ← All API route reference
    ├── AUTHENTICATION_FLOW.md         ← Session/authz lifecycle and 2FA flows
    ├── DATABASE_SCHEMA_OVERVIEW.md    ← Domain-level DB map + migration source of truth
    ├── DEPLOYMENT_ENVIRONMENT_SETUP.md← Local/deploy env + release validation checklist
    ├── BUILD_PERFORMANCE.md
    ├── BUNDLE_ANALYSIS.md
    ├── CODE_AUDIT.md
    ├── CODE_QUALITY_REPORT.md
    ├── PAYMENT_SERVICE_OPTIMIZATION.md
    └── REFRESH_LOOP_FIX_SUMMARY.md
```

---

## Quick Start by Role

### For End Users

→ **[guides/USAGE_GUIDE.md](guides/USAGE_GUIDE.md)** — step-by-step feature guide

### For Developers

1. **[guides/GETTING_STARTED.md](guides/GETTING_STARTED.md)** — environment setup
2. **[guides/ARCHITECTURE_GUIDE.md](guides/ARCHITECTURE_GUIDE.md)** — how the system fits together
3. **[technical/API_REFERENCE.md](technical/API_REFERENCE.md)** — all API endpoints
4. **[guides/QUICK_REFERENCE.md](guides/QUICK_REFERENCE.md)** — common commands
5. **[TYPES.md](TYPES.md)** — shared type system conventions

### For Understanding Storage

→ **[technical/STORAGE_SYSTEM.md](technical/STORAGE_SYSTEM.md)** — MinIO primary + R2 fallback, migration, status checks

### For Security/Auth

→ **[technical/SECURITY.md](technical/SECURITY.md)** — auth flow, 2FA, rate limiting, session handling

### For Document Management

→ **[guides/DOCUMENT_MANAGEMENT_GUIDE.md](guides/DOCUMENT_MANAGEMENT_GUIDE.md)** — upload, preview, PDF thumbnails, categorisation

---

## 📖 Main Guides

### User Guides

| Guide                                           | Description          | Time   |
| ----------------------------------------------- | -------------------- | ------ |
| [USAGE_GUIDE.md](guides/USAGE_GUIDE.md)         | Complete user manual | 45 min |
| Dashboard, Applications, LMS, Pricing, Settings | All features covered | -      |

### Developer Guides

| Guide                                                   | Description             | Time   |
| ------------------------------------------------------- | ----------------------- | ------ |
| [WINDOWS_SETUP_GUIDE.md](guides/WINDOWS_SETUP_GUIDE.md) | Windows + VS Code setup | 1 hour |
| [ARCHITECTURE_GUIDE.md](guides/ARCHITECTURE_GUIDE.md)   | Technical deep-dive     | 1 hour |
| [QUICK_REFERENCE.md](guides/QUICK_REFERENCE.md)         | Commands & snippets     | 5 min  |
| [GETTING_STARTED.md](guides/GETTING_STARTED.md)         | Onboarding checklists   | 15 min |

### Technical Documentation

| Guide                                                                        | Description                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| [PAYMENT_SERVICE_OPTIMIZATION.md](technical/PAYMENT_SERVICE_OPTIMIZATION.md) | LMS performance optimization                 |
| [REFRESH_LOOP_FIX_SUMMARY.md](technical/REFRESH_LOOP_FIX_SUMMARY.md)         | React optimization patterns                  |
| [BUILD_PERFORMANCE.md](technical/BUILD_PERFORMANCE.md)                       | Build optimization                           |
| [CODE_QUALITY_REPORT.md](technical/CODE_QUALITY_REPORT.md)                   | Code quality metrics                         |
| [DEPENDENCY_AUDIT.md](technical/DEPENDENCY_AUDIT.md)                         | Dependency vulnerability and upgrade actions |
| [AUTHENTICATION_FLOW.md](technical/AUTHENTICATION_FLOW.md)                   | Authentication/session + role authorization flow |
| [DATABASE_SCHEMA_OVERVIEW.md](technical/DATABASE_SCHEMA_OVERVIEW.md)         | High-level schema domains and migration process |
| [DEPLOYMENT_ENVIRONMENT_SETUP.md](technical/DEPLOYMENT_ENVIRONMENT_SETUP.md) | Deployment config and validation checklist |

---

## 🔍 Find What You Need

### Setup & Installation

- **First time?** → [guides/GETTING_STARTED.md](guides/GETTING_STARTED.md)
- **Windows?** → [guides/WINDOWS_SETUP_GUIDE.md](guides/WINDOWS_SETUP_GUIDE.md)
- **Environment variables?** → [guides/WINDOWS_SETUP_GUIDE.md#step-4](guides/WINDOWS_SETUP_GUIDE.md#step-4)
- **Database setup?** → [guides/WINDOWS_SETUP_GUIDE.md#step-5](guides/WINDOWS_SETUP_GUIDE.md#step-5)

### Using the Application

- **Dashboard?** → [guides/USAGE_GUIDE.md#dashboard-overview](guides/USAGE_GUIDE.md#dashboard-overview)
- **Applications?** → [guides/USAGE_GUIDE.md#applications-dashboard](guides/USAGE_GUIDE.md#applications-dashboard)
- **Payments?** → [guides/USAGE_GUIDE.md#payments--transactions](guides/USAGE_GUIDE.md#payments--transactions)
- **Pricing?** → [guides/USAGE_GUIDE.md#pricing-management](guides/USAGE_GUIDE.md#pricing-management)

### Development

- **Architecture?** → [guides/ARCHITECTURE_GUIDE.md](guides/ARCHITECTURE_GUIDE.md)
- **API routes?** → [guides/ARCHITECTURE_GUIDE.md#api-routes](guides/ARCHITECTURE_GUIDE.md#api-routes)
- **Components?** → [guides/ARCHITECTURE_GUIDE.md#component-architecture](guides/ARCHITECTURE_GUIDE.md#component-architecture)
- **Hooks?** → [guides/ARCHITECTURE_GUIDE.md#custom-hooks](guides/ARCHITECTURE_GUIDE.md#custom-hooks)

### Troubleshooting

- **Common issues?** → [guides/WINDOWS_SETUP_GUIDE.md#common-issues](guides/WINDOWS_SETUP_GUIDE.md#common-issues)
- **Quick fixes?** → [guides/QUICK_REFERENCE.md#troubleshooting](guides/QUICK_REFERENCE.md#troubleshooting)
- **FAQ?** → [guides/USAGE_GUIDE.md#faq](guides/USAGE_GUIDE.md#faq)

---

## 📊 Documentation Stats

```
Total Files: 25+
Total Lines: ~10,000 lines
Coverage: 95%+ of features
Languages: Markdown, SQL
Updated: February 2026
```

---

## 🆘 Need Help?

1. **Can't find something?** Use Ctrl+F in this file or check [../DOCUMENTATION_INDEX.md](../DOCUMENTATION_INDEX.md)
2. **Setup issues?** Read [guides/WINDOWS_SETUP_GUIDE.md#troubleshooting](guides/WINDOWS_SETUP_GUIDE.md#troubleshooting)
3. **Still stuck?** Open an issue on [GitHub](https://github.com/PiyamDev1/pt-portal/issues)

---

## 📝 Contributing to Docs

Found an error or want to improve documentation?

1. Edit the relevant file
2. Commit with clear message
3. Submit pull request
4. Documentation team will review

---

## 🔗 Quick Links

- **Main README**: [../README.md](../README.md)
- **Documentation Index**: [../DOCUMENTATION_INDEX.md](../DOCUMENTATION_INDEX.md)
- **GitHub Repo**: [PiyamDev1/pt-portal](https://github.com/PiyamDev1/pt-portal)

---

**© 2026 Rathobixz Inc. All rights reserved.**

Last Updated: February 2026

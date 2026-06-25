# PT-Portal Documentation

This folder is the source of truth for PT-Portal documentation. It is written to support three use cases:

- local developer onboarding
- operations and deployment work
- GitHub Pages publishing

If you are reading this inside the repo, start here. If you are reading the published docs site, the equivalent landing page is [index.md](index.md).

## Documentation structure

### Start here

- Overview and project entry point: [Repository README](https://github.com/PiyamDev1/pt-portal/blob/main/README.md)
- Docs site landing page: [index.md](index.md)
- Setup and onboarding: [guides/GETTING_STARTED.md](guides/GETTING_STARTED.md)
- Developer workflow: [guides/DEVELOPER_GUIDE.md](guides/DEVELOPER_GUIDE.md)
- Quick reference: [guides/QUICK_REFERENCE.md](guides/QUICK_REFERENCE.md)

### Product and workflow guides

- Usage guide: [guides/USAGE_GUIDE.md](guides/USAGE_GUIDE.md)
- Appointment bookings: [guides/BOOKINGS_GUIDE.md](guides/BOOKINGS_GUIDE.md)
- Document management: [guides/DOCUMENT_MANAGEMENT_GUIDE.md](guides/DOCUMENT_MANAGEMENT_GUIDE.md)
- Deployment and release: [guides/DEPLOYMENT_GUIDE.md](guides/DEPLOYMENT_GUIDE.md)
- External services and integrations: [guides/INTEGRATIONS_GUIDE.md](guides/INTEGRATIONS_GUIDE.md)
- Frappe HRMS implementation: [guides/FRAPPE_HRMS_SETUP.md](guides/FRAPPE_HRMS_SETUP.md)
- Frappe attendance sync and bridge behavior are documented in the HRMS setup guide
- Windows setup: [guides/WINDOWS_SETUP_GUIDE.md](guides/WINDOWS_SETUP_GUIDE.md)

### Technical reference

- Architecture: [guides/ARCHITECTURE_GUIDE.md](guides/ARCHITECTURE_GUIDE.md)
- API surface: [technical/API_REFERENCE.md](technical/API_REFERENCE.md)
- Authentication flow: [technical/AUTHENTICATION_FLOW.md](technical/AUTHENTICATION_FLOW.md)
- Database overview: [technical/DATABASE_SCHEMA_OVERVIEW.md](technical/DATABASE_SCHEMA_OVERVIEW.md)
- Security: [technical/SECURITY.md](technical/SECURITY.md)
- Storage: [technical/STORAGE_SYSTEM.md](technical/STORAGE_SYSTEM.md)
- Deployment environment notes: [technical/DEPLOYMENT_ENVIRONMENT_SETUP.md](technical/DEPLOYMENT_ENVIRONMENT_SETUP.md)
- Shared type conventions: [TYPES.md](TYPES.md)

### Planning, operations, and archive

- Planning index: [plans/README.md](plans/README.md)
- Operations notes: [operations/README.md](operations/README.md)
- Archive index: [archive/README.md](archive/README.md)

## Recommended reading paths

### New developer

1. [Repository README](https://github.com/PiyamDev1/pt-portal/blob/main/README.md)
2. [guides/GETTING_STARTED.md](guides/GETTING_STARTED.md)
3. [guides/ARCHITECTURE_GUIDE.md](guides/ARCHITECTURE_GUIDE.md)
4. [guides/INTEGRATIONS_GUIDE.md](guides/INTEGRATIONS_GUIDE.md)
5. [guides/QUICK_REFERENCE.md](guides/QUICK_REFERENCE.md)

### Product/admin user

1. [guides/USAGE_GUIDE.md](guides/USAGE_GUIDE.md)
2. [guides/BOOKINGS_GUIDE.md](guides/BOOKINGS_GUIDE.md)
3. [guides/DOCUMENT_MANAGEMENT_GUIDE.md](guides/DOCUMENT_MANAGEMENT_GUIDE.md)

### Deployment/ops

1. [guides/DEPLOYMENT_GUIDE.md](guides/DEPLOYMENT_GUIDE.md)
2. [guides/INTEGRATIONS_GUIDE.md](guides/INTEGRATIONS_GUIDE.md)
3. [guides/FRAPPE_HRMS_SETUP.md](guides/FRAPPE_HRMS_SETUP.md)
4. [technical/SECURITY.md](technical/SECURITY.md)

## GitHub Pages

The docs folder is set up to be publishable as a GitHub Pages site:

- Site landing page: [index.md](index.md)
- Jekyll config: [\_config.yml](_config.yml)
- Deployment workflow: [GitHub Pages workflow](https://github.com/PiyamDev1/pt-portal/blob/main/.github/workflows/github-pages.yml)

This keeps the repo docs and the published docs using the same source files instead of maintaining two separate documentation sets.

# Database Schema Overview

Last updated: March 18, 2026

## Purpose

This document provides a high-level map of database domains used by PT-Portal and where to find authoritative migration history.

## Source of Truth

Database structure is defined by SQL migrations in:

- `scripts/migrations/`
- root-level SQL utility scripts in `scripts/`

Always treat migration files as authoritative over secondary documentation.

## Core Domains

### Authentication and User Profiles

Primary concern:

- User identity, role, and profile metadata used for route authorization and dashboard scoping.

### Applications Domain

Primary concern:

- NADRA applications
- Visa applications
- Passport applications (PAK and GB flows)
- Status history and complaint/notes timelines

### LMS Domain

Primary concern:

- Customer accounts
- Transactions
- Installment plans
- Payment methods
- Audit logs and operational notes

### Documents Domain

Primary concern:

- Document metadata records tied to family heads/applications
- Storage keys, buckets/providers, MIME and size metadata
- Logical delete flags and listing support

### Timeclock Domain

Primary concern:

- Device registry
- Scan events
- Team event views and manual/adjustment workflows

## Data Access Patterns

- API routes use Supabase server clients for all privileged reads/writes.
- Route handlers validate required params/body before mutation.
- Error responses are standardized through shared API helper utilities.

## Operational Notes

- Keep schema changes additive where possible.
- Pair any schema change with route/test updates in the same change set.
- Add migration comments for destructive operations or data backfills.

## Maintenance Checklist for Schema Changes

1. Add migration SQL in `scripts/migrations/`.
2. Update route code and shared types if payload shape changes.
3. Add or update unit tests covering new behavior.
4. Validate local lint/type/test/build before merge.
5. Update `docs/technical/API_REFERENCE.md` if endpoint contracts changed.

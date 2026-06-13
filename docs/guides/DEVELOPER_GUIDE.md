# Developer Guide

This guide explains how to work in PT-Portal without having to reverse-engineer the repo from scratch.

## Core principles

- `app/` holds pages, route handlers, and feature-local UI
- `lib/` holds shared business logic, integrations, and server-side helpers
- `hooks/` holds shared reusable React hooks
- `scripts/migrations/` is the durable database history
- `scripts/bootstrap/` and `scripts/manual/` hold manual setup and follow-up scripts
- `docs/` is part of the working system, not an afterthought

## Where to put code

Use `app/` when the code is tied to one route, page, or feature surface.

Use `lib/` when:

- the logic is shared between API routes and UI
- the code talks to external services
- the module defines reusable business rules
- the code is infrastructure-heavy and should stay framework-light

Use `hooks/` when the behavior is React state orchestration that multiple components may reuse.

## Commenting standard

This repo prefers comments that explain:

- why a module exists
- what external dependency or business rule shaped it
- what can go wrong if it is changed carelessly

Avoid comments that only describe syntax-level behavior.

## High-risk areas

Be extra careful in:

- `lib/integrations/frappe/`
- `lib/auth/`
- `lib/services/document*`
- `lib/booking*`
- `app/api/`

These areas coordinate with external systems, security-sensitive flows, or persistent operational data.

## Before opening a PR

Run:

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
```

If your change affects deployments, docs, or manual setup, update the matching file under `docs/`.

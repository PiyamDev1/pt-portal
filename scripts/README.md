# Scripts

The `scripts/` directory is organized by purpose.

## Folders

- `migrations/`
  - ordered SQL migrations that reflect the tracked database history
- `bootstrap/`
  - setup SQL used to initialize larger feature areas manually when needed
- `manual/`
  - follow-up or backfill scripts used outside the formal migration chain
- `manual/legacy/`
  - older one-off helpers kept for reference pending final removal decisions
- `dev/`
  - local developer utility scripts

## Guidance

- Prefer `scripts/migrations/` for durable schema evolution.
- Use `bootstrap/` only when the docs or runtime explicitly call for manual setup.
- Treat `manual/legacy/` as suspect until confirmed still needed.

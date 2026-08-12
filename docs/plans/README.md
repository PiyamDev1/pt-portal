# Planning Documents

> Historical/planning material only. Nothing in this folder is implementation authority.

This folder retains design decisions, handoffs, cleanup snapshots, and feature proposals. Some plans describe features that have since shipped; others remain unimplemented or only partially implemented.

## Root plan classification

| File                                     | Classification/current authority                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CODEBASE_CLEANUP_GUIDE.md`              | Superseded cleanup snapshot; references removed generic hooks/constants. Use current source and the active developer/architecture guides. |
| `CODEBASE_REFACTORING_PLAN.md`           | Point-in-time audit and refactor proposal; remeasure before acting.                                                                       |
| `CODEBASE_STRUCTURE_GUIDE.md`            | Superseded directory/barrel structure snapshot.                                                                                           |
| `FRAPPE_HRMS_SENIOR_HANDOFF.md`          | Historical handoff; use [Frappe HRMS Setup](../guides/FRAPPE_HRMS_SETUP.md).                                                              |
| `PK_PASSPORT_DRAFT_MODE_PLAN.md`         | Completed design snapshot; use current source and [API Reference](../technical/API_REFERENCE.md).                                         |
| `PT_TIMECLOCK_ESP32_FIRMWARE_HANDOFF.md` | External firmware handoff snapshot; revalidate the signed-device contract and deployment before use.                                      |

## Subfolders

- [`future/`](future/README.md) for proposals and historical designs, with current classification

## Notes

- These files are intentionally retained for context.
- They are planning artifacts, not the primary source of truth for current implementation details.
- Current developer-facing documentation lives under `docs/guides/` and `docs/technical/`.
- A checked box or “complete” label records what was believed at that point in time; verify current source, migrations, and active guides before acting.

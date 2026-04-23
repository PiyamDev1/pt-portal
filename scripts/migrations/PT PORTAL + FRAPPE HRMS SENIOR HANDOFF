PT PORTAL + FRAPPE HRMS SENIOR HANDOFF
Date: 2026-04-18
Owner: PT Portal Team

==================================================
1) GOAL
==================================================
Set up a real bidirectional integration between PT Portal and Frappe HRMS for:
- Employee Lifecycle
- Leave
- Attendance (including PT timeclock punches)

Non-negotiable:
- No user auth/login UX change in PT Portal
- PT users stay on ims.piyamtravel.com
- Frappe is integrated backend service, not end-user frontend

==================================================
2) TARGET ARCHITECTURE (LONG-TERM MAINTENANCE FRIENDLY)
==================================================
Frontend:
- PT Portal only (ims.piyamtravel.com)

Backend systems:
- PT Portal app + Supabase (primary runtime)
- Frappe HRMS on separate domain/host (example: frappe-backend.piyamtravel.com)

Integration pattern:
- PT -> Frappe: outbox push
- Frappe -> PT: webhook + pull reconciliation
- Idempotent dedupe keys + conflict table

Why:
- Avoid brittle /HR reverse-proxy path-prefix hacks
- Keep single UI and single auth for users
- Isolated upgrades and failures

==================================================
3) WHAT IS ALREADY IMPLEMENTED IN REPO
==================================================
Migration foundation:
- scripts/migrations/20260418_frappe_bidirectional_integration_foundation.sql
- scripts/migrations/20260418_frappe_integration_bootstrap_seed.sql

Integration code:
- app/api/integrations/frappe/webhook/route.ts
- app/api/integrations/frappe/sync/push/route.ts
- app/api/integrations/frappe/sync/pull/route.ts
- app/api/integrations/frappe/reconcile/route.ts
- app/api/cron/integrations/frappe/outbox/route.ts
- lib/integrations/frappe/client.ts
- lib/integrations/frappe/mappers.ts
- lib/integrations/frappe/syncEngine.ts
- lib/integrations/frappe/webhookAuth.ts
- app/api/hr/leave/requests/route.ts

Live DB check already confirmed:
- New integration and leave tables exist
- FK links are valid
- Seed applied (leave types, identity map, leave balances)

==================================================
4) COOLIFY DEPLOYMENT PLAN FOR FRAPPE HRMS
==================================================
Context:
- Existing server: Hetzner CX23 with Chatwoot/Evolution/Coolify
- Frappe should be isolated in its own Coolify resource

Deployment steps:
1. DNS
   - Add A record: frappe-backend.piyamtravel.com -> server public IP

2. Coolify resource
   - Project: frappe-hrms-backend
   - New resource: Docker Compose
   - Deploy Frappe stack with services:
     mariadb, redis-cache, redis-queue, redis-socketio,
     backend, frontend/nginx, websocket, scheduler, queue workers

3. Persistence
   - Volumes for mariadb data, sites, logs, backups

4. Domain + TLS
   - Domain on frontend service: frappe-backend.piyamtravel.com
   - Enable HTTPS with LetsEncrypt

5. First boot + HRMS app
   - Ensure ERPNext installed
   - Install HRMS app
   - Migrate site

6. Integration user in Frappe
   - Create dedicated API user (not Administrator)
   - Least-privilege roles for Employee/Leave/Attendance sync
   - Generate API key/secret

Operational note:
- CX23 is tight for Chatwoot + Evolution + Frappe
- Strongly consider separate VPS for Frappe if resource pressure observed

==================================================
5) PT PORTAL ENVIRONMENT VARIABLES REQUIRED
==================================================
Set in PT deployment env:
- FRAPPE_BASE_URL=https://frappe-backend.piyamtravel.com
- FRAPPE_API_KEY=...
- FRAPPE_API_SECRET=...   (or FRAPPE_API_TOKEN if used)
- FRAPPE_WEBHOOK_SECRET=...
- CRON_SECRET=...

Then restart PT app.

==================================================
6) WEBHOOK + SYNC WIRING
==================================================
Frappe webhooks:
- Send leave, attendance, lifecycle change events to:
  /api/integrations/frappe/webhook

Security:
- Sign webhook payloads with shared FRAPPE_WEBHOOK_SECRET
- PT verifies signature in webhook route

Push path:
- PT outbox dispatcher:
  /api/cron/integrations/frappe/outbox

Manual sync paths:
- POST /api/integrations/frappe/sync/pull
- POST /api/integrations/frappe/sync/push
- POST /api/integrations/frappe/reconcile

==================================================
7) ACCEPTANCE TEST (MINIMUM)
==================================================
1. Frappe URL healthy over HTTPS
2. PT sync pull endpoint returns reachable ping
3. Create leave request in PT
4. Confirm row in integration_outbox
5. Trigger outbox dispatch
6. Confirm corresponding leave appears/updates in Frappe
7. Trigger change in Frappe, verify integration_inbox entry in PT

Success criteria:
- End-to-end leave event roundtrip works
- No user login flow change in PT
- No end-user navigation to Frappe required

==================================================
8) RISKS + CONTROLS
==================================================
Risk: Event loop between systems
Control: source markers + dedupe keys + idempotent writes

Risk: Identity mismatch
Control: integration_identity_map mandatory backfill and maintenance

Risk: Resource contention on CX23
Control: resource limits in Coolify; ideally isolate Frappe on separate host

Risk: Drift over time
Control: scheduled reconcile + conflict review in integration_conflicts

==================================================
9) OPEN ITEMS FOR SENIOR DECISION
==================================================
1. Keep Frappe on current CX23 vs move to dedicated VPS
2. Exact role model for Frappe integration user
3. Webhook event granularity and retry strategy
4. Monitoring/alerts stack for outbox backlog and failed syncs

End of handoff.
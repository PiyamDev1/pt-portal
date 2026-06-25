# Frappe HRMS Setup

This guide is for the PT Portal deployment shape we actually want:

- PT Portal stays the only user-facing app
- Frappe HRMS runs as a backend service on a dedicated Ubuntu server
- PT Portal talks to Frappe over API, webhook, and outbox sync

## Scope

Use this guide when deploying Frappe HRMS on a Linux Ubuntu server that is already dedicated enough to also host the Storage Hub.

Recommended target:

- Ubuntu 22.04 LTS
- 4 vCPU minimum
- 8 GB RAM minimum
- 120 GB SSD minimum

If this host is also carrying large storage workloads, give Frappe its own Docker network, its own persistent volumes, and watch memory pressure closely.

## What PT Portal Already Has

Already implemented in this repo:

- Outbox push dispatcher
- Webhook ingestion endpoint
- Health/diagnostic endpoint
- Staff transfer/provisioning screen for creating or linking Frappe Employees from IMS staff
- Maintenance tab controls for health, pull, push, and reconcile
- IMS-controlled browser handoff into the Frappe HRMS `/hrms` app shell
- Handoff audit trail in Supabase for issued, blocked, and failed launches
- Mobile companion-app guidance for installing IMS and Frio HRMS PWAs
- Timeclock attendance summaries that flow from IMS into Frappe
- Integration foundation migrations
- Leave domain seed data and identity map bootstrap

Key PT Portal endpoints:

- `GET /api/integrations/frappe/health`
- `POST /api/integrations/frappe/sync/push`
- `POST /api/integrations/frappe/sync/pull`
- `POST /api/integrations/frappe/reconcile`
- `POST /api/integrations/frappe/webhook`
- `GET /api/integrations/frappe/provisioning/candidates`
- `POST /api/integrations/frappe/provisioning/transfer`
- `GET/POST /api/integrations/frappe/provisioning/me`
- `GET /api/integrations/frappe/handoff`
- `GET /api/cron/integrations/frappe/outbox`
- `GET /api/cron/integrations/frappe/timeclock-attendance`

## PT Portal Environment Variables

Set these in PT Portal before going live:

```env
FRAPPE_BASE_URL=https://frappe-backend.your-domain.tld
FRAPPE_API_KEY=...
FRAPPE_API_SECRET=...
FRAPPE_WEBHOOK_SECRET=...
FRAPPE_HANDOFF_SECRET=...
CRON_SECRET=...
```

You can use `FRAPPE_API_TOKEN` instead of `FRAPPE_API_KEY` and `FRAPPE_API_SECRET`, but not both.

`FRAPPE_HANDOFF_SECRET` signs short-lived browser handoff tokens from IMS into Frappe. It must
match `ims_handoff_secret` in the Frappe site config.

The Frappe side also needs the IMS base URL and the same handoff secret:

```bash
bench --site frio.piyamtravel.com set-config ims_base_url "https://ims.piyamtravel.com"
bench --site frio.piyamtravel.com set-config ims_handoff_secret "YOUR_SHARED_SECRET"
bench --site frio.piyamtravel.com migrate
bench --site frio.piyamtravel.com clear-cache
```

Run these Supabase migrations before enabling handoff enforcement:

1. `scripts/migrations/20260418_frappe_bidirectional_integration_foundation.sql`
2. `scripts/migrations/20260418_frappe_integration_bootstrap_seed.sql`
3. `scripts/migrations/20260611_frappe_hrms_identity_domain.sql`
4. `scripts/migrations/20260612_add_frappe_handoff_events.sql`

## Recommended Install Method

Use Frappe's production deployment tooling on Ubuntu.

High-level install shape:

1. Prepare DNS for the Frappe hostname
2. Install Docker and Docker Compose plugin
3. Run Frappe's production installer
4. Install the HRMS app on the site
5. Create a restricted integration user + API credentials
6. Configure webhook back to PT Portal
7. Validate with PT Portal health and push endpoints

## Ubuntu Server Setup

### 1. Base packages

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git jq ufw
```

### 2. Firewall

Adjust if you already manage firewall elsewhere.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

### 4. DNS

Create an A record like:

- `frappe-backend.your-domain.tld -> server public IP`

Wait for DNS to resolve before doing TLS-backed setup.

### 5. Frappe production deploy

Download Frappe's installer:

```bash
cd /opt
sudo mkdir -p frappe
sudo chown $USER:$USER frappe
cd frappe
wget https://frappe.io/easy-install.py
```

Run the deploy command:

```bash
python3 ./easy-install.py deploy \
  --project=frappe_hrms_prod \
  --email=you@example.com \
  --image=ghcr.io/frappe/hrms \
  --version=stable \
  --app=erpnext \
  --app=hrms \
  --sitename=frappe-backend.your-domain.tld
```

Notes:

- Replace `you@example.com` with the real operational email
- Replace `frappe-backend.your-domain.tld` with the real domain
- ERPNext must be installed before HRMS because the base `Employee` DocType lives in ERPNext
- This is the simplest production path consistent with current Frappe docs

## Post-Install Frappe Tasks

### 0. Verify ERPNext + HRMS apps are installed

Before connecting PT Portal, check the site apps from the backend container:

```bash
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frappe-backend.your-domain.tld list-apps'
```

Expected apps include:

- `frappe`
- `erpnext`
- `hrms`

If `Employee` transfers fail with `DocType Employee not found`, ERPNext is missing from the
site. Install ERPNext, then rerun HRMS/migrations:

```bash
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frappe-backend.your-domain.tld install-app erpnext'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frappe-backend.your-domain.tld install-app hrms || true'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frappe-backend.your-domain.tld migrate && bench --site frappe-backend.your-domain.tld clear-cache'
```

### 1. Log in and change Administrator password

Do this immediately.

### 2. Confirm the company record exists

PT Portal hardwires employee transfers to this company:

- `Piyam Travel LTD`

If the Frappe site has a slightly different spelling, rename the company or add an
alias before enabling transfers. The current provisioning code treats this as the
canonical operating company.

### 3. Install the IMS bridge app

The PT Portal repo includes a small Frappe app at:

- `frappe_apps/piyam_ims_bridge`

It handles IMS-signed browser handoff, adds a `Back to IMS` action in Frappe Desk,
and lets IMS remain the only normal login door.

Recommended purpose:

- Employee sync
- Leave sync
- Attendance sync
- Webhook generation
- IMS-signed browser handoff

Do not use `Administrator` for PT Portal integration.

If you publish the bridge app as a separate repository, include it in your Frappe
`apps.json` alongside ERPNext and HRMS:

```json
[
  {
    "url": "https://github.com/frappe/erpnext",
    "branch": "version-15"
  },
  {
    "url": "https://github.com/frappe/hrms",
    "branch": "version-15"
  },
  {
    "url": "https://github.com/PiyamDev1/piyam_ims_bridge",
    "branch": "main"
  }
]
```

After rebuilding the image, install the bridge app on the site:

```bash
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com install-app piyam_ims_bridge'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com set-config ims_handoff_secret "same-value-as-FRAPPE_HANDOFF_SECRET"'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com set-config ims_base_url "https://ims.piyamtravel.com"'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com migrate && bench --site frio.piyamtravel.com clear-cache'
```

### 4. Generate API credentials

In Frappe:

- Create API key
- Create API secret
- Store them in PT Portal env as:
  - `FRAPPE_API_KEY`
  - `FRAPPE_API_SECRET`

### 5. Configure webhook to PT Portal

Target URL:

- `https://ims.piyamtravel.com/api/integrations/frappe/webhook`

Secret:

- Must match `FRAPPE_WEBHOOK_SECRET` in PT Portal

Recommended event scope:

- Employee changes
- Leave Application changes
- Attendance changes

### 6. Verify PT Portal can talk to Frappe

From PT Portal, set:

- `FRAPPE_BASE_URL`
- `FRAPPE_API_KEY`
- `FRAPPE_API_SECRET`
- `FRAPPE_WEBHOOK_SECRET`
- `FRAPPE_HANDOFF_SECRET`

Then test:

```bash
GET /api/integrations/frappe/health
POST /api/integrations/frappe/sync/push
POST /api/integrations/frappe/sync/pull
POST /api/integrations/frappe/reconcile
```

### 7. Turn on direct-access protection

Once handoff works, enable the guard on Frappe:

```bash
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com set-config ims_enforce_handoff 1'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com clear-cache'
```

With `ims_enforce_handoff` enabled, unauthenticated visits to `/`, `/login`, `/app`, and `/hrms`
redirect back to IMS. Safe target paths are preserved, so a blocked launch can resume after IMS
approves it.

Recommended mobile pattern:

1. Install IMS from `https://ims.piyamtravel.com`
2. Open `Employee Module` from IMS
3. IMS authenticates the user and opens Frio at `/hrms`
4. If Frio is opened later without a valid session, it redirects to IMS and then returns
   to the originally requested target after approval

### 8. Frappe branding

Use Frappe's own settings for the company logo:

1. Search for `Website Settings` in Frappe
2. Set the logo/favicon for Piyam Travel
3. Search for `Navbar Settings` if you want to adjust Desk navigation labels

The IMS bridge app adds the `Back to IMS` button automatically after `bench build --app
piyam_ims_bridge`.

### 8. Timeclock attendance sync

IMS remains the clock-in source of truth.

PT Portal periodically:

- groups punch events into daily attendance summaries
- queues those summaries for Frappe
- exposes pending / dead-letter counts in the dashboard and maintenance panels

If an employee punches in late or the punch stream needs reprocessing, use:

- the dashboard bridge card backfill action
- the maintenance tab attendance backfill action

Both actions queue recent summaries again without changing the source punch records.

### 9. First employee transfer flow

For the first person you move over:

1. Open the IMS transfer screen
2. Confirm the company is `Piyam Travel LTD`
3. Fill the employee-owned HRMS fields:
   - Date of joining
   - Gender
   - Date of birth
4. Fill any manager/admin-owned fields that are already known:
   - Department
   - Branch/location
   - Designation/role
5. Enable `Create Frappe login user` only if the employee should have direct Frappe access
6. Submit the transfer
7. Confirm PT Portal creates the identity map and Frappe Employee record
8. Open the employee module again to confirm the signed handoff works

If required manager/admin-owned data is missing, the employee should be told to
contact their line manager or an admin before transfer can complete.

## Validation Checklist

### From PT Portal side

Run after env vars are configured:

1. `GET /api/integrations/frappe/health`
2. `POST /api/integrations/frappe/sync/pull`
3. `POST /api/integrations/frappe/sync/push`

Expected outcome:

- health shows `ping_ok: true`
- outbox/inbox counts are visible
- 24-hour handoff counts and recent handoff events are visible after the audit migration
- sync state returns without auth or connectivity errors

### From PT Portal UI

Open:

- `Settings -> Data Maintenance`

Use:

1. `Health`
2. `Pull Leave`
3. `Push Outbox`
4. `Reconcile`

This is the fastest way to validate the integration without going directly to SQL first.

### Staff transfer

Open:

- `Dashboard -> Employee Module` for staff self-service
- `Settings -> Frappe Transfer`

Self-service behavior:

- first-time/unlinked employees see the transfer setup screen
- linked employees are sent through the signed IMS handoff into Frappe HRMS
- if manager/admin-owned setup data is missing, the employee sees a contact line manager/admin message

The transfer will:

- link an existing Frappe Employee if one already exists for the staff email
- otherwise create a Frappe Employee
- create or reuse a Frappe User when needed for IMS handoff, without sending a Frappe welcome email
- store the mapping in `integration_identity_map` using domain `hrms`

### Minimum business test

1. Create a leave request in PT Portal
2. Confirm an `integration_outbox` row exists
3. Trigger push sync
4. Confirm a matching Leave Application is created/updated in Frappe
5. Open `Employee Module` from IMS
6. Confirm the user is taken into Frappe through handoff rather than a direct login page

Leave and attendance pushes require this mapping. If an employee has not been transferred, push
sync will fail that outbox row instead of sending an IMS UUID into Frappe.

If Frappe is still blank after install, check these first:

- `erpnext` is installed on the site
- `hrms` is installed on the site
- `piyam_ims_bridge` is installed on the site
- `ims_base_url` and `ims_handoff_secret` are set on the Frappe site
- PT Portal has the matching `FRAPPE_HANDOFF_SECRET`

That covers the common “Frappe exists but nothing is wired up” state.

## Timeclock policy

Staff should clock in and out from IMS only.

Do not let regular staff use Frappe as a separate clock-in/out surface. Keep the
Frappe side as the attendance backend only:

- PT Portal records the live punches
- PT Portal aggregates them into daily attendance
- PT Portal pushes the attendance summary into Frappe

Operationally, that means:

1. Keep the IMS handoff guard enabled
2. Remove direct attendance/Employee Checkin access from non-admin Frappe roles
3. Use the PT Portal timeclock screen as the only staff-facing clocking UI

If you want to be stricter, hide or revoke any Desk shortcut that opens Frappe's
native attendance/check-in pages for regular staff. The portal now treats IMS as the
single source of clock-in truth and pushes attendance summaries into Frappe instead
of asking staff to clock in there directly.

## Operational Advice

### Keep Frappe isolated on the server

Even on the same larger Ubuntu server:

- Use separate Docker volumes
- Use separate reverse-proxy hostname
- Do not mix PT and Frappe process trees
- Monitor RAM and disk IO

### Backups

Back up:

- Frappe MariaDB data
- `sites` volume
- logs if retained

### Monitoring

At minimum, watch:

- Frappe site health
- PT `/api/integrations/frappe/health`
- `integration_outbox` dead-letter count
- `integration_conflicts` open count

## Known Current Gap

Current repo state is strongest for:

- leave push
- webhook ingestion
- sync infrastructure

Still staged:

- full pull reconciliation logic
- richer conflict resolution UI
- complete attendance/timeclock mapping workflow

That is acceptable for rollout if we start with leave first and treat attendance as phase 2.

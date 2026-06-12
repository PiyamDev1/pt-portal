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

### 2. Create an integration user

Create a dedicated non-admin API user for PT Portal.

Recommended purpose:

- Employee sync
- Leave sync
- Attendance sync
- Webhook generation

Do not use `Administrator` for PT Portal integration.

### 3. Generate API credentials

In Frappe:

- Create API key
- Create API secret
- Store them in PT Portal env as:
  - `FRAPPE_API_KEY`
  - `FRAPPE_API_SECRET`

### 4. Configure webhook to PT Portal

Target URL:

- `https://ims.piyamtravel.com/api/integrations/frappe/webhook`

Secret:

- Must match `FRAPPE_WEBHOOK_SECRET` in PT Portal

Recommended event scope:

- Employee changes
- Leave Application changes
- Attendance changes

### 5. Install the IMS bridge app

The PT Portal repo includes a small Frappe app at:

- `frappe_apps/piyam_ims_bridge`

It handles IMS-signed browser handoff, adds a `Back to IMS` button in Frappe Desk, and can block
unauthenticated direct Frappe UI access once testing is complete. IMS should be treated as the only
normal login door; Frio HRMS is a guarded companion app.

For Docker/Coolify, add this app to the same custom Frappe image that already contains ERPNext and
HRMS. The cleanest production option is to publish `frappe_apps/piyam_ims_bridge` as its own Git
repository, then add it to your `apps.json`:

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

After rebuilding/redeploying the image, install and configure the bridge app:

```bash
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com install-app piyam_ims_bridge'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com set-config ims_handoff_secret "same-value-as-FRAPPE_HANDOFF_SECRET"'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com set-config ims_base_url "https://ims.piyamtravel.com"'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com migrate && bench build --app piyam_ims_bridge && bench --site frio.piyamtravel.com clear-cache'
```

If the bridge app was copied into a running container manually instead of baked into the image, add
it to `sites/apps.txt` before `install-app`:

```bash
sudo docker exec -it backend-<coolify-suffix> bash -lc 'cd /home/frappe/frappe-bench && grep -qxF piyam_ims_bridge sites/apps.txt || echo piyam_ims_bridge >> sites/apps.txt'
```

If `bench build --app piyam_ims_bridge` fails because `node` is not available in the backend
container, continue without it for the handoff test. The Python handoff endpoint does not require
asset building; the build only affects the `Back to IMS` Desk button.

Test the normal IMS flow first. `Dashboard -> Employee Module` should open the Frappe HRMS shell at
`https://frio.piyamtravel.com/hrms` through a signed handoff token. On mobile, users can install the
Frio HRMS companion app from that `/hrms` screen, but future direct access still bounces through IMS
for approval.

Once the handoff works, turn on direct-access protection:

```bash
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com set-config ims_enforce_handoff 1'
sudo docker exec -it backend-<coolify-suffix> bash -lc 'bench --site frio.piyamtravel.com clear-cache'
```

With `ims_enforce_handoff` enabled, unauthenticated visits to `/`, `/login`, `/app`, and `/hrms`
redirect back to IMS. Authenticated Frappe sessions and API-token requests continue to work.

Recommended mobile pattern:

1. Install IMS from `https://ims.piyamtravel.com`.
2. Open `Employee Module` from IMS.
3. IMS authenticates the user and opens Frio at `/hrms`.
4. Install the Frio HRMS companion app from the `/hrms` screen.
5. If the Frio companion app is opened later without a valid Frappe session, it redirects to IMS and
   IMS signs the user back into Frio.

### 6. Frappe branding

Use Frappe's own settings for the company logo:

1. Search for `Website Settings` in Frappe
2. Set the logo/favicon for Piyam Travel
3. Search for `Navbar Settings` if you want to adjust Desk navigation labels

The IMS bridge app adds the `Back to IMS` button automatically after `bench build --app
piyam_ims_bridge`.

## Validation Checklist

### From PT Portal side

Run after env vars are configured:

1. `GET /api/integrations/frappe/health`
2. `POST /api/integrations/frappe/sync/pull`
3. `POST /api/integrations/frappe/sync/push`

Expected outcome:

- health shows `ping_ok: true`
- outbox/inbox counts are visible
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

Use this before real leave or attendance sync:

1. Confirm the pre-filled IMS details
2. Fill the employee-owned HRMS fields:
   - Date of joining
   - Gender
   - Date of birth
3. Submit the transfer

Manager/admin-owned fields must already be available from IMS or Frappe setup:

- Company
- Department
- Branch/location
- Designation/role

Admin-managed transfer adds one extra option:

- Enable `Create Frappe login user` only for staff who need direct Frappe access

The transfer will:

- link an existing Frappe Employee if one already exists for the staff email
- otherwise create a Frappe Employee
- create or reuse a Frappe User when needed for IMS handoff, without sending a Frappe welcome email
- store the mapping in `integration_identity_map` using domain `hrms`

Leave and attendance pushes require this mapping. If an employee has not been transferred, push
sync will fail that outbox row instead of sending an IMS UUID into Frappe.

### Minimum business test

1. Create a leave request in PT Portal
2. Confirm an `integration_outbox` row exists
3. Trigger push sync
4. Confirm a matching Leave Application is created/updated in Frappe
5. Change the leave in Frappe
6. Confirm webhook reaches PT Portal and `integration_inbox` receives the event

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

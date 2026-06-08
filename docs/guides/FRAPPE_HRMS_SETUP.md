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
- Maintenance tab controls for health, pull, push, and reconcile
- Integration foundation migrations
- Leave domain seed data and identity map bootstrap

Key PT Portal endpoints:

- `GET /api/integrations/frappe/health`
- `POST /api/integrations/frappe/sync/push`
- `POST /api/integrations/frappe/sync/pull`
- `POST /api/integrations/frappe/reconcile`
- `POST /api/integrations/frappe/webhook`
- `GET /api/cron/integrations/frappe/outbox`

## PT Portal Environment Variables

Set these in PT Portal before going live:

```env
FRAPPE_BASE_URL=https://frappe-backend.your-domain.tld
FRAPPE_API_KEY=...
FRAPPE_API_SECRET=...
FRAPPE_WEBHOOK_SECRET=...
CRON_SECRET=...
```

You can use `FRAPPE_API_TOKEN` instead of `FRAPPE_API_KEY` and `FRAPPE_API_SECRET`, but not both.

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
  --app=hrms \
  --sitename=frappe-backend.your-domain.tld
```

Notes:

- Replace `you@example.com` with the real operational email
- Replace `frappe-backend.your-domain.tld` with the real domain
- This is the simplest production path consistent with current Frappe docs

## Post-Install Frappe Tasks

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

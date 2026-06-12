# Piyam IMS Bridge

Small Frappe app for IMS-controlled access to Frappe HRMS.

It provides:

- `/api/method/piyam_ims_bridge.api.handoff.consume` for short-lived IMS handoff tokens
- a Desk navbar button back to IMS
- optional redirect of unauthenticated direct Frappe UI visits back to IMS
- guarded HRMS companion-app access at `/hrms`, with IMS as the normal login door
- safe target preservation when a guest opens `/hrms` or `/app/...` directly

## Required Site Config

Set these on the Frappe site:

```bash
bench --site frio.piyamtravel.com set-config ims_handoff_secret "same-value-as-FRAPPE_HANDOFF_SECRET"
bench --site frio.piyamtravel.com set-config ims_base_url "https://ims.piyamtravel.com"
bench --site frio.piyamtravel.com set-config ims_enforce_handoff 1
```

`ims_enforce_handoff` can be left unset while testing. Turn it on after the IMS handoff works.

When enforcement is enabled, staff can install Frio HRMS from `/hrms`, but unauthenticated launches
redirect back to IMS for approval before returning to Frio. Public assets, PWA manifests, and
non-login API requests are allowed through so the app can load normally after authentication.

## Install

Add this app to the custom Frappe image, install it on the site, then rebuild assets:

```bash
bench --site frio.piyamtravel.com install-app piyam_ims_bridge
bench --site frio.piyamtravel.com migrate
bench build --app piyam_ims_bridge
bench --site frio.piyamtravel.com clear-cache
```

## Smoke Test

After install:

```bash
curl -i -H "Host: frio.piyamtravel.com" \
  "http://localhost:8088/api/method/piyam_ims_bridge.api.handoff.consume"
```

Expected result without a token is a redirect back to IMS with `handoff=failed`. After
`ims_enforce_handoff` is enabled, opening `/hrms` as a guest should redirect to IMS with
`handoff=required`.

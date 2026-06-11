# Piyam IMS Bridge

Small Frappe app for IMS-controlled access to Frappe HRMS.

It provides:

- `/api/method/piyam_ims_bridge.api.handoff.consume` for short-lived IMS handoff tokens
- a Desk navbar button back to IMS
- optional redirect of unauthenticated direct Frappe UI visits back to IMS

## Required Site Config

Set these on the Frappe site:

```bash
bench --site frio.piyamtravel.com set-config ims_handoff_secret "same-value-as-FRAPPE_HANDOFF_SECRET"
bench --site frio.piyamtravel.com set-config ims_base_url "https://ims.piyamtravel.com"
bench --site frio.piyamtravel.com set-config ims_enforce_handoff 1
```

`ims_enforce_handoff` can be left unset while testing. Turn it on after the IMS handoff works.

## Install

Add this app to the custom Frappe image, install it on the site, then rebuild assets:

```bash
bench --site frio.piyamtravel.com install-app piyam_ims_bridge
bench --site frio.piyamtravel.com migrate
bench build --app piyam_ims_bridge
bench --site frio.piyamtravel.com clear-cache
```

# Customer Integration Appointment API

Last verified against source: September 1, 2026.

These routes are private server-to-server integrations for the independent
customer portal. They are not staff-session or browser endpoints.

## Available appointment dates

### POST `/api/integrations/customer/v1/appointments/available-dates`

**Access:** Customer portal server only. Requests require the configured key
ID, timestamp, nonce, body digest, request ID, and valid HMAC signature. Stale
or replayed requests are rejected.

**Input:** Strict JSON `{ serviceId, branchId, groupSize }`. The IDs are public
resource-alias UUIDs and `groupSize` is an integer from 1 to 100.

**Success:** `200` integration envelope containing an array of
`{ date, availableTimeCount }` for bookable dates in the next 35 days. Dates
without a valid service schedule or remaining capacity are omitted. This
lookup does not issue temporary booking slots.

**Errors:** `400` invalid input or group size; `401`/`403` invalid integration
authentication, timestamp, origin, or replayed nonce; `404` unknown public
service or branch; `503` schedule or capacity data is unavailable.

# Customer portal ticket trips

Signed server-to-server endpoint used by the customer portal to show normal Ticketing-ledger journeys alongside package trips.

### POST `/api/integrations/customer/v1/trips/tickets`

**Access:** Requires the customer integration HMAC headers, nonce replay protection, and the `customer-portal` integration origin. This is not a browser endpoint.

**Input:** JSON object containing the authenticated customer profile `email`. The endpoint normalizes the email and never accepts an employee, booking ID, or customer subject from the browser.

**Success:** Returns up to 100 active Held or Issued ticket journeys linked to that normalized email. Each result contains an opaque trip alias, PNR, airline label, departure and return dates, destination, and the active itinerary-sector schedule. Financials and ticket documents are excluded.

**Errors:** `400` for an invalid contract, `401` or `403` for invalid integration authentication, `409` for replay conflicts, `503` when Ticketing schedules cannot be loaded, and `500` for an unexpected internal error.

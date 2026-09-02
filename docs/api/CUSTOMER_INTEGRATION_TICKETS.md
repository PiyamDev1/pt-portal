# Customer portal ticket trips

Signed server-to-server endpoint used by the customer portal to show normal Ticketing-ledger journeys alongside package trips.

### POST `/api/integrations/customer/v1/trips/tickets`

**Access:** Requires the customer integration HMAC headers, nonce replay protection, and the `customer-portal` integration origin. This is not a browser endpoint.

**Input:** JSON object containing `pnr` and `lastName`. The endpoint normalizes both values and returns a result only when exactly one active Held or Issued ticket matches both.

**Success:** Returns the matching ticket journey with an opaque trip alias, PNR, airline label, departure and return dates, destination, and the active itinerary-sector schedule. Financials and ticket documents are excluded.

**Errors:** `400` for an invalid contract, `401` or `403` for invalid integration authentication, `409` for replay conflicts, `503` when Ticketing schedules cannot be loaded, and `500` for an unexpected internal error.

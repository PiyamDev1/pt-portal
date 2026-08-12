# Shared Constants

This directory holds small configuration values shared by multiple modules.

- `api.ts` exposes `API_ENDPOINTS`, the client-side receipt and Settings endpoint paths currently
  shared across components and hooks.
- `receiptConfig.ts` owns receipt labels, PIN length, currency, company name, and verification URL
  defaults used by receipt generation and templates.

Import the concrete module rather than a directory barrel:

```ts
import { API_ENDPOINTS } from '@/lib/constants/api'
import { RECEIPT_PIN_LENGTH } from '@/lib/constants/receiptConfig'
```

Keep feature-local constants with their feature. Add a root constant only when multiple consumers
share the same contract.

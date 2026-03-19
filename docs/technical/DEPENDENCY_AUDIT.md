# Dependency Audit

Last updated: March 17, 2026

## Summary

Audit command:

```bash
npm audit --json
```

Result:

- Total vulnerabilities: 0 (after remediation)

## Findings

### 1. `next` vulnerabilities (moderate) — Resolved

Affected range includes current version `16.1.6`.
Advisories indicate fixes available in `16.1.7`.

Action completed:

- Upgraded `next` to patched range (`^16.1.7`).

### 2. `flatted` vulnerability (high, transitive) — Resolved

Issue: unbounded recursion DoS in parse revive phase for versions `<3.4.0`.
Fix is available via dependency updates.

Action completed:

- Applied `npm audit fix`.
- Re-ran audit and verified zero remaining vulnerabilities.

## Recommendations

1. Add monthly dependency audit cadence.
2. Add CI step:

```bash
npm audit --omit=dev
```

3. Record approved exceptions with expiry date if a fix is temporarily blocked.

## Bundle/Dependency Hygiene

- Track large deps (`@aws-sdk/*`, `pdfjs-dist`, `html2canvas`) in bundle analysis.
- Prefer route-level lazy loading for heavy client-side features.

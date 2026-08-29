import type {
  PackageComponentOption,
  TravelPackageFolder,
  TravelPackageTransportVoucherData,
} from '@/app/types/packages'

const DEFAULT_TRANSPORT_PROVIDER = 'Barakat AlMusafar Trading'
const DEFAULT_TRANSPORT_PROVIDER_CONTACT = '+966555049005'
const DEFAULT_EXTRA_BAGGAGE_FEE = '50 SAR per bag'
const DEFAULT_CUSTOMER_PORTAL_URL = 'https://bookings.piyamtravel.com'
const PIYAM_LOGO_SRC = '/logo.png'
export interface TransportVoucherRenderOptions {
  logoSrc?: string
}

const TRANSPORT_VOUCHER_PRINT_CSS = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html,
  body {
    font-family: Inter, Arial, sans-serif;
    color: #111827;
    margin: 0;
    background: #f4f6f8;
  }
  .preview-toolbar {
    width: 207.8mm;
    max-width: calc(100% - 24px);
    margin: 16px auto -12px;
    display: flex;
    justify-content: flex-end;
  }
  .preview-toolbar button {
    appearance: none;
    border: 0;
    border-radius: 5px;
    background: #800000;
    color: #fff;
    cursor: pointer;
    font: 800 13px Inter, Arial, sans-serif;
    padding: 9px 14px;
  }
  .preview-toolbar button:hover { background: #660000; }
  .print-sheet {
    width: 207.8mm;
    height: 215.6mm;
    max-width: calc(100% - 24px);
    margin: 24px auto;
    display: grid;
    grid-template-columns: 107.8mm 2mm 98mm;
    align-items: stretch;
    background: #fff;
  }
  .voucher {
    width: 107.8mm;
    height: 215.6mm;
    margin: 0;
    background: #fff;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    border: 1px dashed #cbd5e1;
    overflow: hidden;
  }
  .cut-divider {
    width: 0;
    height: 215.6mm;
    justify-self: center;
    border-left: .5mm dotted #64748b;
    background: transparent;
  }
  .access-voucher {
    width: 98mm;
    height: 215.6mm;
    padding: 0;
    background: #fff;
    border: 1px solid #b8c4d3;
    border-left: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    overflow: hidden;
  }
  .access-colour-bars {
    width: 100%;
    height: 2.4mm;
    display: grid;
    grid-template-columns: 3fr 1fr 1fr;
  }
  .access-colour-bars span:nth-child(1) { background: #8b1e2d; }
  .access-colour-bars span:nth-child(2) { background: #c9952e; }
  .access-colour-bars span:nth-child(3) { background: #0891b2; }
  .access-header {
    width: 100%;
    min-height: 39mm;
    padding: 5mm 6mm 4mm;
    background: #fff;
    color: #0f172a;
    border-bottom: 1.5mm solid #8b1e2d;
  }
  .access-pass-label {
    margin: 0;
    color: #8b1e2d;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .1em;
  }
  .access-logo-wrap {
    width: 43mm;
    min-height: 19mm;
    margin: 2.5mm auto 0;
    padding: 2.2mm 3mm;
    border-radius: 6px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .access-logo {
    display: block;
    width: 36mm;
    max-height: 15mm;
    object-fit: contain;
  }
  .access-logo-fallback {
    display: none;
    color: #800000;
    font-size: 18px;
    font-weight: 900;
  }
  .access-tagline {
    margin: 2.2mm 0 0;
    color: #0f172a;
    font-size: 9.5px;
    font-weight: 900;
    letter-spacing: .06em;
  }
  .access-body {
    position: relative;
    width: 100%;
    flex: 1;
    min-height: 0;
    padding: 5mm 6mm;
    background: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .access-body > * {
    position: relative;
    z-index: 1;
  }
  .access-watermarks {
    position: absolute;
    z-index: 0;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    color: #8b1e2d;
    font-family: Arial, sans-serif;
    font-weight: 900;
  }
  .access-watermarks span {
    position: absolute;
    display: block;
    opacity: .055;
    line-height: 1;
  }
  .access-watermarks span:nth-child(1) {
    left: 3mm;
    top: 50mm;
    font-size: 52px;
    transform: rotate(-18deg);
  }
  .access-watermarks span:nth-child(2) {
    right: 4mm;
    top: 82mm;
    color: #0e7490;
    font-size: 48px;
    transform: rotate(12deg);
  }
  .access-watermarks span:nth-child(3) {
    left: 7mm;
    bottom: 13mm;
    color: #c9952e;
    font-size: 42px;
    transform: rotate(-8deg);
  }
  .access-details {
    position: relative;
    width: 100%;
    padding: 4mm;
    border: 1px solid #6f1422;
    border-radius: 6px;
    background: #8b1e2d;
    text-align: left;
    overflow: hidden;
  }
  .access-details::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 1.5mm;
    background: #000;
  }
  .access-details .access-label { color: #f8e8eb; }
  .access-label {
    margin: 0;
    color: #64748b;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .access-name {
    margin: .8mm 0 0;
    color: #fff;
    font-size: 20px;
    font-weight: 900;
    overflow-wrap: anywhere;
  }
  .access-reference-row {
    margin-top: 3mm;
    padding-top: 3mm;
    border-top: 1px solid rgba(255, 255, 255, .35);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3mm;
  }
  .access-reference {
    display: inline-block;
    margin: 0;
    border: 1px solid rgba(255, 255, 255, .75);
    border-radius: 5px;
    background: #fff;
    padding: 1.5mm 2.5mm;
    color: #6f1422;
    font: 900 16px ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: nowrap;
  }
  .access-scan-copy {
    margin: 4mm 0 2.5mm;
    color: #334155;
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1.35;
  }
  .access-scan-copy strong { color: #0f172a; }
  .access-qr-frame {
    position: relative;
    padding: 2.2mm;
    border: 1.2mm solid #8b1e2d;
    border-radius: 8px;
    background: #fff;
  }
  .access-qr-frame::before,
  .access-qr-frame::after {
    content: "";
    position: absolute;
    width: 8mm;
    height: 8mm;
    border-color: #c9952e;
  }
  .access-qr-frame::before {
    left: -2.1mm;
    top: -2.1mm;
    border-left: 1mm solid #c9952e;
    border-top: 1mm solid #c9952e;
  }
  .access-qr-frame::after {
    right: -2.1mm;
    bottom: -2.1mm;
    border-right: 1mm solid #c9952e;
    border-bottom: 1mm solid #c9952e;
  }
  .access-qr-title {
    margin: 2.8mm 0 0;
    color: #8b1e2d;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .1em;
  }
  .access-qr-wrap {
    width: 43mm;
    height: 43mm;
    padding: 2mm;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .access-qr-wrap img {
    display: block;
    width: 39mm;
    height: 39mm;
  }
  .access-qr-fallback {
    color: #475569;
    font-size: 9px;
    font-weight: 800;
    overflow-wrap: anywhere;
  }
  .access-portal {
    width: 100%;
    margin-top: auto;
    padding: 3mm 3.5mm;
    border: 1px solid #bae6fd;
    border-radius: 6px;
    background: #ecfeff;
  }
  .access-portal .access-label { color: #0e7490; }
  .access-website {
    margin: 1mm 0 0;
    color: #0f172a;
    font-size: 15px;
    font-weight: 900;
    overflow-wrap: anywhere;
  }
  .access-validity {
    width: 100%;
    margin: 2.5mm 0 0;
    padding: 2.5mm 3mm;
    border-left: 1mm solid #c9952e;
    background: #fff8e7;
    color: #713f12;
    font-size: 9px;
    font-weight: 800;
    line-height: 1.35;
    text-align: left;
  }
  .access-footer {
    width: 100%;
    min-height: 18mm;
    padding: 3.5mm 5mm;
    background: #8b1e2d;
    border-top: 1px solid #6f1422;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4mm;
    text-align: left;
  }
  .access-footer p { margin: 0; }
  .access-support-title {
    color: #fff;
    font-size: 11px;
    font-weight: 900;
  }
  .access-support-detail {
    margin-top: .8mm !important;
    font-size: 9px;
    font-weight: 700;
  }
  .access-secure-badge {
    border: 1px solid #fff;
    border-radius: 999px;
    background: #fff;
    padding: 1.5mm 2.3mm;
    color: #8b1e2d;
    font-size: 8px;
    font-weight: 900;
    white-space: nowrap;
  }
  .standalone-access-sheet {
    width: 98mm;
    height: 215.6mm;
    margin: 24px auto;
  }
  .standalone-access-sheet .access-voucher {
    border-left: 1px solid #cbd5e1;
  }
  .main {
    flex: 1;
    min-height: 0;
    padding: 4.8mm;
    display: flex;
    flex-direction: column;
    font-size: 10px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 4mm;
    padding-bottom: 2.6mm;
    border-bottom: 1px solid #e5e7eb;
  }
  .brand {
    min-width: 30mm;
  }
  .brand-logo {
    display: block;
    max-width: 29mm;
    max-height: 13mm;
    object-fit: contain;
  }
  .brand-fallback {
    display: none;
    font-size: 15px;
    font-weight: 900;
    color: #800000;
  }
  .title { text-align: right; }
  .title h1 {
    font-size: 17px;
    font-weight: 900;
    color: #800000;
    margin: 0;
    line-height: 1;
  }
  .title p {
    font-size: 8px;
    font-weight: 800;
    color: #6b7280;
    letter-spacing: .05em;
    margin: 2px 0 0;
  }
  .summary {
    margin-top: 2.8mm;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }
  .summary-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 25mm;
    gap: 3mm;
    padding: 2.2mm 2.4mm;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.8mm 3mm;
    padding: 2.2mm 2.4mm;
  }
  .label {
    font-size: 7.2px;
    color: #6b7280;
    margin: 0;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: .03em;
  }
  .value {
    font-weight: 800;
    color: #1f2937;
    margin: 0;
  }
  .lead {
    font-size: 12.5px;
    color: #111827;
  }
  .itinerary {
    margin-top: 3mm;
    border-top: 1px solid #e5e7eb;
    padding-top: 2.5mm;
  }
  .itinerary-list {
    font-size: 9px;
    margin-top: 2mm;
    color: #374151;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1mm;
  }
  .timeline-item {
    display: grid;
    grid-template-columns: 8.5mm 1fr;
    gap: 1.8mm;
    break-inside: avoid;
    position: relative;
  }
  .timeline-item:not(:last-child)::before {
    content: "";
    position: absolute;
    left: 4.1mm;
    top: 7.4mm;
    bottom: -1.4mm;
    border-left: 1.5px solid #fecaca;
  }
  .timeline-marker {
    position: relative;
    z-index: 1;
  }
  .timeline-marker span {
    display: flex;
    width: 8.2mm;
    height: 8.2mm;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: #800000;
    color: #fff;
    font-size: 6.5px;
    font-weight: 900;
  }
  .timeline-card {
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    padding: 1.4mm 1.9mm;
    background: #f9fafb;
  }
  .timeline-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 2.3mm;
  }
  .timeline-row strong {
    font-size: 11.2px;
    color: #111827;
  }
  .timeline-row span {
    font-size: 13px;
    font-weight: 900;
    color: #800000;
    text-align: right;
    white-space: nowrap;
  }
  .route {
    margin: .8mm 0 0;
    font-size: 11px;
    font-weight: 700;
    color: #374151;
  }
  .segment-meta {
    display: inline-block;
    margin: 1mm 0 0;
    border-radius: 999px;
    background: #fff;
    padding: .8mm 1.8mm;
    font-size: 9.5px;
    font-weight: 900;
    color: #475569;
    border: 1px solid #e2e8f0;
  }
  .footer {
    border-top: 1px solid #e5e7eb;
    padding-top: 1.6mm;
    margin-top: auto;
    font-size: 9px;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr);
    gap: 2mm;
  }
  .footer p { margin: 0; }
  .footer .value {
    font-size: 9.8px;
    color: #111827;
  }
  .footer .contact-line {
    margin-top: .5mm;
    font-size: 8.8px;
    font-weight: 800;
    color: #334155;
  }
  .stub {
    background: #800000;
    color: #fff;
    padding: 3.8mm;
    height: 51mm;
    flex-shrink: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 31mm;
    gap: 3.5mm;
    align-items: stretch;
  }
  .stub-head {
    display: flex;
    align-items: center;
    gap: 2mm;
    padding-bottom: 2.4mm;
    border-bottom: 1px solid #a83333;
  }
  .stub-logo {
    display: block;
    max-width: 29mm;
    max-height: 13mm;
    background: #fff;
    border-radius: 5px;
    padding: 2mm;
    object-fit: contain;
  }
  .stub-logo-fallback {
    display: none;
    background: #fff;
    border-radius: 5px;
    padding: 2mm;
    color: #800000;
    font-size: 11px;
    font-weight: 900;
  }
  .stub-head p {
    font-size: 8px;
    opacity: .85;
    margin: 0;
    font-weight: 800;
    letter-spacing: .08em;
  }
  .stub-stack {
    margin-top: 2.4mm;
    font-size: 9px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.8mm 3mm;
  }
  .stub-label {
    font-size: 6.8px;
    color: #fecaca;
    margin: 0;
    font-weight: 800;
    letter-spacing: .04em;
  }
  .stub-value {
    font-weight: 800;
    margin: 0;
  }
  .qr {
    width: 30mm;
    height: 30mm;
    background: #fff;
    color: #111827;
    padding: 2mm;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    font-size: 6px;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr img {
    display: block;
    width: 26mm;
    height: 26mm;
  }
  .qr-wrap {
    align-self: center;
    justify-self: center;
  }
  .notice {
    margin-top: 2mm;
    padding: 2mm;
    background: #fef2f2;
    border-left: 3px solid #800000;
    white-space: pre-wrap;
    font-size: 8px;
  }
  .continuation-note {
    margin: 1.8mm 0 0;
    padding: 1.4mm 2mm;
    border: 1px solid #f5c2c2;
    border-radius: 4px;
    background: #fff7f7;
    color: #800000;
    font-size: 8.5px;
    font-weight: 900;
    text-align: center;
  }
  .continuation-sheet {
    break-before: page;
    page-break-before: always;
  }
  .continuation-voucher {
    grid-column: 1;
  }
  .continuation-voucher .main {
    flex: 1;
  }
  .continuation-heading {
    margin-top: 3mm;
    padding-bottom: 2.5mm;
    border-bottom: 1px solid #e5e7eb;
  }
  .continuation-heading h2 {
    margin: 0;
    color: #800000;
    font-size: 15px;
    font-weight: 900;
  }
  .continuation-heading p {
    margin: .8mm 0 0;
    color: #475569;
    font-size: 9px;
    font-weight: 800;
  }
  .continuation-voucher .itinerary {
    margin-top: 3.5mm;
  }
  .continuation-blank {
    grid-column: 3;
    width: 98mm;
    height: 215.6mm;
    border: 1px dashed #e2e8f0;
    border-left: 0;
    background: #fff;
  }
  @media print {
    html,
    body {
      width: 210mm;
      min-height: 297mm;
      height: auto;
      background: #fff;
      overflow: visible;
    }
    .print-sheet {
      width: 207.8mm;
      height: 215.6mm;
      max-width: none;
      margin: 4.5mm auto 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-sheet + .print-sheet,
    .continuation-sheet {
      break-before: page !important;
      page-break-before: always !important;
    }
    .voucher {
      width: 107.8mm;
      height: 215.6mm;
      margin: 0;
      border-radius: 0;
      border: 1px dashed #94a3b8;
      box-shadow: none;
    }
    .access-voucher {
      width: 98mm;
      height: 215.6mm;
      border-radius: 0;
    }
    .standalone-access-sheet {
      width: 98mm;
      height: 215.6mm;
      margin: 0;
    }
    .main { padding: 4.8mm; }
    .stub { padding: 3.8mm; }
    .itinerary-list { gap: .9mm; }
    .timeline-card { padding: 1.3mm 1.8mm; }
    .no-print { display: none; }
  }
  @media screen and (max-width: 720px) {
    body { background: #fff; }
    .preview-toolbar {
      width: calc(100% - 24px);
      margin-bottom: 12px;
    }
    .print-sheet {
      max-width: none;
      margin: 0;
      transform: scale(.52);
      transform-origin: top left;
    }
    .voucher {
      margin: 0;
      border-radius: 0;
      width: 100%;
      height: auto;
      min-height: 215.6mm;
    }
    .summary-top,
    .summary-grid {
      grid-template-columns: 1fr;
    }
    .footer { display: block; }
    .title {
      text-align: left;
      margin-top: 10px;
    }
    .header { display: block; }
    .timeline-row { display: block; }
    .timeline-row span {
      display: block;
      text-align: left;
      margin-top: 2px;
    }
    .stub {
      height: auto;
      grid-template-columns: 1fr;
    }
    .stub-stack { grid-template-columns: 1fr; }
    .qr { min-height: 32mm; }
  }
`

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

type AccessVoucherPackage = Pick<
  TravelPackageFolder,
  'package_reference' | 'customer_name' | 'customer_access_last_name'
>

function renderAccessVoucherPanel(
  packageFolder: AccessVoucherPackage,
  qrCodeDataUrl: string,
  logoSrc: string,
) {
  const qrContent = qrCodeDataUrl
    ? `<img src="${escapeHtml(qrCodeDataUrl)}" alt="Open customer portal" />`
    : `<span class="access-qr-fallback">${escapeHtml(DEFAULT_CUSTOMER_PORTAL_URL)}</span>`

  return `<section class="access-voucher">
    <div class="access-colour-bars" aria-hidden="true"><span></span><span></span><span></span></div>
    <header class="access-header">
      <p class="access-pass-label">CUSTOMER ACCESS PASS</p>
      <div class="access-logo-wrap"><img class="access-logo" src="${escapeHtml(logoSrc)}" alt="Piyam Travel" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="access-logo-fallback">Piyam Travel</span></div>
      <p class="access-tagline">YOUR JOURNEY, ONE SECURE PORTAL</p>
    </header>
    <div class="access-body">
      <div class="access-watermarks" aria-hidden="true"><span>&#9992;</span><span>&#9673;</span><span>&#8801;</span></div>
      <div class="access-details">
        <p class="access-label">Lead customer</p>
        <p class="access-name">${escapeHtml(packageFolder.customer_name || 'Customer')}</p>
        <div class="access-reference-row"><p class="access-label">Travel reference</p><p class="access-reference">${escapeHtml(packageFolder.package_reference)}</p></div>
      </div>
      <p class="access-scan-copy"><strong>Scan your pass</strong><br>Open your secure travel portal and keep your documents close throughout your journey.</p>
      <div class="access-qr-frame"><div class="access-qr-wrap">${qrContent}</div></div>
      <p class="access-qr-title">SCAN TO OPEN YOUR PORTAL</p>
      <div class="access-portal"><p class="access-label">Portal address</p><p class="access-website">${escapeHtml(DEFAULT_CUSTOMER_PORTAL_URL.replace('https://', ''))}</p></div>
      <p class="access-validity">Link and documents are valid for 10 months. You can request the office to extend this.</p>
    </div>
    <footer class="access-footer"><div><p class="access-support-title">Need help while travelling?</p><p class="access-support-detail">info@piyamtravel.com | +44 7400 828212</p></div><span class="access-secure-badge">SECURE ACCESS</span></footer>
  </section>`
}

export function renderStandaloneAccessVoucherHtml(
  packageFolder: AccessVoucherPackage,
  qrCodeDataUrl: string,
  options: TransportVoucherRenderOptions = {},
) {
  const logoSrc = options.logoSrc || getPiyamLogoSrc()
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Voucher ${escapeHtml(packageFolder.package_reference)}</title>
  <style>${TRANSPORT_VOUCHER_PRINT_CSS}</style>
</head>
<body><div class="preview-toolbar no-print"><button type="button" onclick="window.print()">Print access voucher</button></div><main class="standalone-access-sheet">${renderAccessVoucherPanel(packageFolder, qrCodeDataUrl, logoSrc)}</main></body>
</html>`
}

function dateOnly(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function timeOnly(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(11, 16)
}

function combineDateTime(date: string, time: string) {
  if (!date && !time) return ''
  if (!date) return time
  if (!time) return date
  return `${date}T${time}`
}

function formatTimeOnly(date: string, time: string) {
  if (!date || !time) return 'N/A'
  const dateTime = new Date(`${date}T${time}`)
  if (Number.isNaN(dateTime.getTime())) return 'N/A'

  const time24hr = dateTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const ampm = dateTime.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric' }).slice(-2)

  return `${time24hr} ${ampm}`
}

function formatVoucherDateTime(date: string, time: string) {
  if (!date || !time) return 'N/A'
  const parsed = new Date(`${date}T${time}`)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  const formattedDate = parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  return `${formattedDate} @ ${formatTimeOnly(date, time)}`
}

function formatDateTime(value: string) {
  if (!value) return 'To be confirmed'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return escapeHtml(value)
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function getPiyamLogoSrc() {
  const baseUrl = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).replace(/\/+$/, '')
  return baseUrl ? `${baseUrl}${PIYAM_LOGO_SRC}` : PIYAM_LOGO_SRC
}

function getSummaryLines(value: string | null | undefined) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean)
}

function getVehicleBags(vehicle: string) {
  const lower = vehicle.toLowerCase()
  if (lower.includes('coach')) return '52'
  if (lower.includes('coaster')) return '18'
  if (lower.includes('hiace')) return '13'
  if (lower.includes('h1')) return '6'
  if (lower.includes('car')) return '3'
  const seats = lower.match(/(\d+)\s*(seat|seater|pax|passenger)/)
  return seats?.[1] || '6'
}

function getVehicleName(value: string | null | undefined) {
  const text = String(value || '').trim()
  if (!text) return 'H1'
  if (/gmc|yukon/i.test(text)) return 'GMC Yukon XL'
  if (/hiace/i.test(text)) return 'Hiace'
  if (/coaster/i.test(text)) return 'Coaster'
  if (/coach/i.test(text)) return 'Coach'
  if (/h1/i.test(text)) return 'H1'
  if (/car/i.test(text)) return 'Car'
  return text
}

function looksLikeUuid(value: string | null | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  )
}

function looksLikeTransportRoute(value: string | null | undefined) {
  const text = String(value || '').trim()
  if (!text) return false
  return (
    text.startsWith('*') ||
    /\b(jeddah|makkah|mecca|madinah|medina|airport|hotel|ziyarat|mazarat)\b/i.test(text)
  )
}

export function cleanTransportVoucherVehicleLabel(value: string | null | undefined, fallback = '') {
  const text = String(value || '').trim()
  if (!text || looksLikeTransportRoute(text) || looksLikeUuid(text)) return fallback
  return getVehicleName(text)
}

export function getPackageCustomerPortalBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_PACKAGE_PORTAL_URL ||
    process.env.NEXT_PUBLIC_BOOKINGS_PORTAL_URL ||
    DEFAULT_CUSTOMER_PORTAL_URL
  ).replace(/\/+$/, '')
}

export function getPackageDocumentPortalUrl(
  token: string,
  baseUrl = getPackageCustomerPortalBaseUrl(),
) {
  const cleanToken = token.trim()
  return cleanToken ? `${baseUrl}/package-documents/${cleanToken}` : baseUrl
}

function routeType(description: string, index: number, total: number) {
  const lower = description.toLowerCase()
  if (lower.includes('ziyar') || lower.includes('tour')) return "Ziyara'at / Tour"
  if (lower.includes('airport') && index === 0) return 'Airport Pickup'
  if (lower.includes('airport') && index === total - 1) return 'Return Transfer'
  if (lower.includes('hotel')) return 'Hotel Transfer'
  return 'Transport Segment'
}

function routeBadge(type: string, description: string) {
  const lower = `${type} ${description}`.toLowerCase()
  if (lower.includes('ziyar') || lower.includes('tour')) return 'ZYA'
  if (lower.includes('return')) return 'RET'
  if (lower.includes('airport')) return 'AIR'
  if (lower.includes('hotel')) return 'HTL'
  return 'TRN'
}

type VoucherTransportOption = PackageComponentOption | null | undefined
type VoucherRouteAssignment = NonNullable<
  TravelPackageTransportVoucherData['routeAssignments']
>[number]

function getStructuredTransportRoutes(transportOption: VoucherTransportOption) {
  return (transportOption?.transportRoutes || []).filter((route) => route.routeName)
}

function getTransportSupplierName(transportOption: VoucherTransportOption) {
  if (!transportOption) return ''
  if (transportOption.transportMainSupplierName) return transportOption.transportMainSupplierName
  const counts = new Map<string, { name: string; count: number }>()
  for (const route of getStructuredTransportRoutes(transportOption)) {
    if (!route.supplierName) continue
    const current = counts.get(route.supplierName)
    counts.set(route.supplierName, {
      name: route.supplierName,
      count: (current?.count || 0) + 1,
    })
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0]?.name || ''
}

function getTransportVehicleName(transportOption: VoucherTransportOption) {
  const routes = getStructuredTransportRoutes(transportOption)
  const vehicleLabels = Array.from(
    new Set(
      routes
        .map((route) =>
          cleanTransportVoucherVehicleLabel(route.vehicleLabel || route.vehicleTypeId),
        )
        .filter(Boolean),
    ),
  )
  if (vehicleLabels.length === 1) return vehicleLabels[0]
  if (vehicleLabels.length > 1) return 'Mixed vehicles'
  return getVehicleName(transportOption?.title || transportOption?.summary)
}

function createRouteAssignments(
  transportOption: VoucherTransportOption,
  departureDate: string,
  returnDate: string,
): VoucherRouteAssignment[] {
  const structuredRoutes = getStructuredTransportRoutes(transportOption)
  const fallbackVehicle = getTransportVehicleName(transportOption)
  return structuredRoutes.map((route, index) => {
    const date =
      index === 0 ? departureDate : index === structuredRoutes.length - 1 ? returnDate : ''
    return {
      routeName: route.routeName,
      type: routeType(route.routeName, index, structuredRoutes.length),
      supplierName: route.supplierName || '',
      vehicleType: cleanTransportVoucherVehicleLabel(
        route.vehicleLabel || route.vehicleTypeId,
        fallbackVehicle,
      ),
      date,
      time: '',
    }
  })
}

function formatPassengerLabel({
  adults,
  children,
  infants,
}: {
  adults: number
  children: number
  infants: number
}) {
  const total = Math.max(0, adults + children + infants)
  const parts = [
    `${adults} Adult${adults === 1 ? '' : 's'}`,
    `${children} Child${children === 1 ? '' : 'ren'}`,
  ]
  if (infants > 0) parts.push(`${infants} Infant${infants === 1 ? '' : 's'}`)
  return `${total} Passenger${total === 1 ? '' : 's'} (${parts.join(', ')})`
}

function createItinerary(
  routes: string[],
  departureDate: string,
  returnDate: string,
): NonNullable<TravelPackageTransportVoucherData['itinerary']> {
  return routes.map((route, index) => ({
    type: routeType(route, index, routes.length),
    description: route,
    date: index === 0 ? departureDate : index === routes.length - 1 ? returnDate : '',
    time: '',
  }))
}

export function createDefaultTransportVoucherData(
  packageFolder: TravelPackageFolder,
): TravelPackageTransportVoucherData {
  const selectedCombination = packageFolder.selected_quote_snapshot?.selection?.combination
  const selectedPayload = packageFolder.selected_quote_snapshot?.payload
  const passengerSummary = packageFolder.passenger_summary || {}
  const adults = Number(passengerSummary.adults || selectedPayload?.adults || 0)
  const children =
    Number(passengerSummary.childrenPaying || selectedPayload?.childrenPaying || 0) +
    Number(passengerSummary.childrenFree || selectedPayload?.childrenFree || 0)
  const infants = Number(passengerSummary.infants || selectedPayload?.infants || 0)
  const departureDate = dateOnly(packageFolder.departure_date || selectedPayload?.departureDate)
  const returnDate = dateOnly(packageFolder.return_date || selectedPayload?.returnDate)
  const transportOption = selectedCombination?.transportOption
  const routeAssignments = createRouteAssignments(transportOption, departureDate, returnDate)
  const structuredRouteLines = routeAssignments.map((route) => route.routeName)
  const transportLines = getSummaryLines(transportOption?.summary)
  const fallbackRoutes = structuredRouteLines.length
    ? structuredRouteLines
    : transportLines.length
      ? transportLines
      : selectedCombination?.staySelections?.length
        ? [
            'Airport to Makkah Hotel',
            ...selectedCombination.staySelections
              .slice(0, -1)
              .map(
                (stay, index) =>
                  `${stay.option.title} to ${selectedCombination.staySelections[index + 1]?.option.title}`,
              ),
            'Hotel to Airport',
          ]
        : []
  const makkahStay = selectedCombination?.staySelections?.find((stay) =>
    /makkah|mecca/i.test(`${stay.groupLabel} ${stay.option.title}`),
  )
  const madinahStay = selectedCombination?.staySelections?.find((stay) =>
    /madinah|medina/i.test(`${stay.groupLabel} ${stay.option.title}`),
  )
  const vehicle = getTransportVehicleName(transportOption)
  const providerName = getTransportSupplierName(transportOption) || DEFAULT_TRANSPORT_PROVIDER

  return {
    bookingId: packageFolder.package_reference,
    adults,
    children,
    infants,
    passengers: formatPassengerLabel({ adults, children, infants }),
    flightNumber: '',
    airports: selectedCombination?.flightOption?.title || '',
    landingDate: departureDate,
    landingTime: '',
    vehicle,
    maxBags: getVehicleBags(vehicle),
    extraBaggageFee: DEFAULT_EXTRA_BAGGAGE_FEE,
    providerName,
    providerContact: DEFAULT_TRANSPORT_PROVIDER_CONTACT,
    itinerary: routeAssignments.length
      ? routeAssignments.map((route) => ({
          type: route.type,
          description: route.routeName,
          date: route.date || '',
          time: route.time || '',
        }))
      : createItinerary(fallbackRoutes, departureDate, returnDate),
    routeAssignments,
    sourceTransportOptionId: transportOption?.id || '',
    sourceTransportOptionTitle: transportOption?.title || '',
    digitalVoucherUrl: '',
    qrCodeDataUrl: '',
    accessVoucherQrCodeDataUrl: '',
    quoteSnapshot: {
      title: packageFolder.selected_quote_snapshot?.quote?.title || '',
      packageType: packageFolder.selected_quote_snapshot?.quote?.package_type || '',
      departureDate,
      returnDate,
      adults,
      children,
      infants,
      flightTitle: selectedCombination?.flightOption?.title || '',
      makkahHotel: makkahStay?.option.title || '',
      madinahHotel: madinahStay?.option.title || '',
      transportOptionId: transportOption?.id || '',
      transportOptionTitle: transportOption?.title || '',
      transportProvider: providerName,
      routes: fallbackRoutes,
    },
    arrivalAirport: '',
    arrivalAt: packageFolder.departure_date || '',
    departureAirport: '',
    departureAt: packageFolder.return_date || '',
    makkahHotel: makkahStay?.option.title || '',
    madinahHotel: madinahStay?.option.title || '',
    routes: fallbackRoutes,
    vehicleType: vehicle,
    transportCompany: providerName,
    driverContact: '',
    groundManager: DEFAULT_TRANSPORT_PROVIDER_CONTACT,
    publicNotes: '',
    internalNotes: '',
  }
}

export function normalizeTransportVoucherData(
  value: unknown,
  fallback?: Partial<TravelPackageTransportVoucherData>,
): TravelPackageTransportVoucherData {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const text = (key: keyof TravelPackageTransportVoucherData) =>
    typeof input[key] === 'string'
      ? String(input[key]).trim()
      : String(fallback?.[key] || '').trim()
  const routes = Array.isArray(input.routes)
    ? input.routes
        .map((route) => String(route).trim())
        .filter(Boolean)
        .slice(0, 20)
    : fallback?.routes || []
  const numberValue = (key: keyof TravelPackageTransportVoucherData) => {
    const parsed = Number(input[key] ?? fallback?.[key] ?? 0)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  const itinerarySource = Array.isArray(input.itinerary)
    ? input.itinerary
    : fallback?.itinerary || []
  const itinerary = itinerarySource
    .map((item) => {
      const candidate = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        type: String(candidate.type || '').trim(),
        description: String(candidate.description || '').trim(),
        date: String(candidate.date || '').trim(),
        time: String(candidate.time || '').trim(),
      }
    })
    .filter((item) => item.type || item.description || item.date || item.time)
    .slice(0, 20)
  const routeAssignmentsSource = Array.isArray(input.routeAssignments)
    ? input.routeAssignments
    : fallback?.routeAssignments || []
  const routeAssignments = routeAssignmentsSource
    .map((item) => {
      const candidate = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        routeName: String(candidate.routeName || '').trim(),
        type: String(candidate.type || '').trim(),
        supplierName: String(candidate.supplierName || '').trim(),
        vehicleType: cleanTransportVoucherVehicleLabel(
          String(candidate.vehicleType || '').trim(),
          String(fallback?.vehicleType || fallback?.vehicle || '').trim(),
        ),
        date: String(candidate.date || '').trim(),
        time: String(candidate.time || '').trim(),
      }
    })
    .filter((item) => item.routeName || item.type || item.supplierName || item.vehicleType)
    .slice(0, 20)
  const adults = numberValue('adults')
  const children = numberValue('children')
  const infants = numberValue('infants')
  const vehicle = text('vehicle') || text('vehicleType')
  const providerName = text('providerName') || text('transportCompany')
  const providerContact = text('providerContact') || text('groundManager')
  const quoteSnapshotInput =
    input.quoteSnapshot && typeof input.quoteSnapshot === 'object'
      ? (input.quoteSnapshot as Record<string, unknown>)
      : fallback?.quoteSnapshot || {}
  const quoteSnapshotRoutes = Array.isArray(quoteSnapshotInput.routes)
    ? quoteSnapshotInput.routes
        .map((route) => String(route).trim())
        .filter(Boolean)
        .slice(0, 20)
    : fallback?.quoteSnapshot?.routes || []

  return {
    bookingId: text('bookingId'),
    adults,
    children,
    infants,
    passengers: text('passengers') || formatPassengerLabel({ adults, children, infants }),
    flightNumber: text('flightNumber'),
    airports: text('airports'),
    landingDate: text('landingDate') || dateOnly(text('arrivalAt')),
    landingTime: text('landingTime') || timeOnly(text('arrivalAt')),
    vehicle,
    maxBags: text('maxBags') || getVehicleBags(vehicle),
    extraBaggageFee: text('extraBaggageFee') || DEFAULT_EXTRA_BAGGAGE_FEE,
    providerName,
    providerContact,
    itinerary,
    routeAssignments,
    sourceTransportOptionId: text('sourceTransportOptionId'),
    sourceTransportOptionTitle: text('sourceTransportOptionTitle'),
    digitalVoucherUrl: text('digitalVoucherUrl'),
    qrCodeDataUrl: text('qrCodeDataUrl'),
    accessVoucherQrCodeDataUrl: text('accessVoucherQrCodeDataUrl'),
    quoteSnapshot: {
      title: String(quoteSnapshotInput.title || '').trim(),
      packageType: String(quoteSnapshotInput.packageType || '').trim(),
      departureDate: String(quoteSnapshotInput.departureDate || '').trim(),
      returnDate: String(quoteSnapshotInput.returnDate || '').trim(),
      adults: Number(quoteSnapshotInput.adults || 0) || 0,
      children: Number(quoteSnapshotInput.children || 0) || 0,
      infants: Number(quoteSnapshotInput.infants || 0) || 0,
      flightTitle: String(quoteSnapshotInput.flightTitle || '').trim(),
      makkahHotel: String(quoteSnapshotInput.makkahHotel || '').trim(),
      madinahHotel: String(quoteSnapshotInput.madinahHotel || '').trim(),
      transportOptionId: String(quoteSnapshotInput.transportOptionId || '').trim(),
      transportOptionTitle: String(quoteSnapshotInput.transportOptionTitle || '').trim(),
      transportProvider: String(quoteSnapshotInput.transportProvider || '').trim(),
      routes: quoteSnapshotRoutes,
    },
    arrivalAirport: text('arrivalAirport'),
    arrivalAt: text('arrivalAt') || combineDateTime(text('landingDate'), text('landingTime')),
    departureAirport: text('departureAirport'),
    departureAt: text('departureAt'),
    makkahHotel: text('makkahHotel'),
    madinahHotel: text('madinahHotel'),
    routes,
    vehicleType: text('vehicleType') || vehicle,
    transportCompany: text('transportCompany') || providerName,
    driverContact: text('driverContact'),
    groundManager: text('groundManager') || providerContact,
    publicNotes: text('publicNotes'),
    internalNotes: text('internalNotes'),
  }
}

export function renderTransportVoucherHtml(
  packageFolder: Pick<
    TravelPackageFolder,
    'package_reference' | 'customer_name' | 'customer_access_last_name' | 'passenger_summary'
  >,
  data: TravelPackageTransportVoucherData,
  options: TransportVoucherRenderOptions = {},
) {
  const passengerCount = Number(packageFolder.passenger_summary?.totalPassengers || 0)
  const passengerLabel =
    data.passengers ||
    formatPassengerLabel({
      adults: data.adults || 0,
      children: data.children || 0,
      infants: data.infants || 0,
    })
  const vehicle = data.vehicle || data.vehicleType || 'To be confirmed'
  const itinerary =
    data.itinerary && data.itinerary.length > 0
      ? data.itinerary
      : createItinerary(data.routes || [], '', '')
  const routeAssignments = data.routeAssignments || []
  const formatSegmentSchedule = (date: string, time: string) => {
    if (date && time) return formatVoucherDateTime(date, time)
    if (date) {
      const parsed = new Date(date)
      if (Number.isNaN(parsed.getTime())) return date
      return parsed.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    }
    if (time) return formatTimeOnly('2000-01-01', time)
    return 'Timing to be confirmed'
  }
  const renderItineraryItems = (
    items: TravelPackageTransportVoucherData['itinerary'],
    offset = 0,
  ) =>
    items?.length
      ? items
          .map((item, localIndex) => {
            const index = offset + localIndex
            const assignment = routeAssignments[index]
            const segmentType = item.type || assignment?.type || 'Transport Segment'
            const segmentRoute =
              item.description || assignment?.routeName || 'Details to be confirmed'
            const segmentVehicle =
              assignment?.vehicleType || (vehicle !== 'Mixed vehicles' ? vehicle : '')
            return `<div class="timeline-item"><div class="timeline-marker"><span>${escapeHtml(routeBadge(segmentType, segmentRoute))}</span></div><div class="timeline-card"><div class="timeline-row"><strong>${index + 1}. ${escapeHtml(segmentType)}</strong><span>${escapeHtml(formatSegmentSchedule(item.date || assignment?.date || '', item.time || assignment?.time || ''))}</span></div><p class="route">${escapeHtml(segmentRoute)}</p>${segmentVehicle ? `<p class="segment-meta">Vehicle: ${escapeHtml(segmentVehicle)}</p>` : ''}</div></div>`
          })
          .join('')
      : '<div class="timeline-item"><div class="timeline-marker"><span>TRN</span></div><div class="timeline-card"><div class="timeline-row"><strong>1. Transport Segment</strong><span>Timing to be confirmed</span></div><p class="route">Details to be confirmed</p></div></div>'
  const primaryItinerary = itinerary.slice(0, 3)
  const continuationItineraries = Array.from(
    { length: Math.ceil(Math.max(0, itinerary.length - primaryItinerary.length) / 7) },
    (_, pageIndex) => itinerary.slice(3 + pageIndex * 7, 3 + (pageIndex + 1) * 7),
  )
  const itineraryHtml = renderItineraryItems(primaryItinerary)
  const qrText = [
    'GROUND TRANSPORT',
    `REF: ${packageFolder.package_reference}`,
    `PASSENGER: ${packageFolder.customer_name || 'Customer'}`,
    '',
    ...itinerary.map(
      (item, index) =>
        `${index + 1}. ${item.type}: ${item.description} at ${formatVoucherDateTime(item.date, item.time)}`,
    ),
  ].join('\n')
  const qrContent = data.qrCodeDataUrl
    ? `<img src="${escapeHtml(data.qrCodeDataUrl)}" alt="Open digital voucher" />`
    : escapeHtml((data.digitalVoucherUrl || qrText).trim())
  const providerName = data.providerName || data.transportCompany || 'To be confirmed'
  const providerContact = data.providerContact || data.groundManager || ''
  const driverContact = data.driverContact || ''
  const transportContactParts = [
    providerContact ? `Provider contact: ${providerContact}` : '',
    driverContact ? `Driver: ${driverContact}` : '',
  ].filter(Boolean)
  const logoSrc = options.logoSrc || getPiyamLogoSrc()
  const accessVoucherHtml = renderAccessVoucherPanel(
    packageFolder,
    data.accessVoucherQrCodeDataUrl || '',
    logoSrc,
  )
  const continuationSheetsHtml = continuationItineraries
    .map((items, pageIndex) => {
      const offset = 3 + pageIndex * 7
      const pageNumber = pageIndex + 2
      const totalPages = continuationItineraries.length + 1
      return `<div class="print-sheet continuation-sheet"><main class="voucher continuation-voucher"><section class="main">
        <header class="header">
          <div class="brand"><img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="Piyam Travel" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="brand-fallback">Piyam Travel</span></div>
          <div class="title"><h1>GROUND TRANSPORT</h1><p>${pageIndex === 0 ? 'REVERSE SIDE / ITINERARY' : 'ITINERARY CONTINUED'}</p></div>
        </header>
        <div class="continuation-heading"><h2>${escapeHtml(packageFolder.customer_name || 'Customer')}</h2><p>${escapeHtml(packageFolder.package_reference)} · ${pageIndex === 0 ? 'Reverse side · ' : ''}Page ${pageNumber} of ${totalPages}</p></div>
        <div class="itinerary"><p class="label">${pageIndex === 0 ? 'Itinerary on reverse' : 'Itinerary continued'}</p><div class="itinerary-list">${renderItineraryItems(items, offset)}</div></div>
        <div class="footer">
          <div><p class="value">Transport provider: ${escapeHtml(providerName)}</p>${transportContactParts.length ? `<p class="contact-line">${escapeHtml(transportContactParts.join(' | '))}</p>` : '<p class="contact-line">Contact details to be confirmed</p>'}</div>
          <div style="text-align:right"><p class="value">24/7 Support</p><p>Email: info@piyamtravel.com<br>+447400828212</p></div>
        </div>
      </section></main><div class="cut-divider" aria-hidden="true"></div><div class="continuation-blank" aria-hidden="true"></div></div>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
	  <meta charset="utf-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1">
		  <title>Transport Voucher ${escapeHtml(packageFolder.package_reference)}</title>
		  <style>${TRANSPORT_VOUCHER_PRINT_CSS}</style>
		</head>
		<body><div class="preview-toolbar no-print"><button type="button" onclick="window.print()">Print vouchers</button></div><div class="print-sheet"><main class="voucher">
	  <section class="main">
	    <header class="header">
	      <div class="brand"><img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="Piyam Travel" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="brand-fallback">Piyam Travel</span></div>
	      <div class="title"><h1>GROUND TRANSPORT</h1><p>VOUCHER / ITINERARY</p></div>
	    </header>
	    <div class="summary">
	      <div class="summary-top">
	        <div><p class="label">Lead passenger</p><p class="value lead">${escapeHtml(packageFolder.customer_name || 'Customer')}</p></div>
	        <div><p class="label">Reference</p><p class="value">${escapeHtml(packageFolder.package_reference)}</p></div>
	      </div>
	      <div class="summary-grid">
	        <div><p class="label">Passengers</p><p class="value">${escapeHtml(passengerLabel || String(passengerCount || 'To be confirmed'))}</p></div>
	        <div><p class="label">Flight</p><p class="value">${escapeHtml(data.flightNumber || 'To be confirmed')}</p></div>
	        <div><p class="label">Arrival from</p><p class="value">${escapeHtml(data.airports || data.arrivalAirport || 'To be confirmed')}</p></div>
	        <div><p class="label">Landing</p><p class="value">${escapeHtml(formatVoucherDateTime(data.landingDate || dateOnly(data.arrivalAt), data.landingTime || timeOnly(data.arrivalAt)))}</p></div>
	      </div>
	    </div>
	    <div class="itinerary"><p class="label">Itinerary</p><div class="itinerary-list">${itineraryHtml}</div>${continuationItineraries.length ? '<p class="continuation-note">Additional transport movements are printed on the reverse side.</p>' : ''}</div>
    <div class="footer">
      <div><p class="value">Transport provider: ${escapeHtml(providerName)}</p>${transportContactParts.length ? `<p class="contact-line">${escapeHtml(transportContactParts.join(' | '))}</p>` : '<p class="contact-line">Contact details to be confirmed</p>'}</div>
      <div style="text-align:right"><p class="value">24/7 Support</p><p>Email: info@piyamtravel.com | +447400828212</p></div>
    </div>
    ${data.publicNotes ? `<div class="notice">${escapeHtml(data.publicNotes)}</div>` : ''}
  </section>
  <aside class="stub">
    <div>
      <div class="stub-head"><img class="stub-logo" src="${escapeHtml(logoSrc)}" alt="Piyam Travel" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="stub-logo-fallback">Piyam Travel</span><p>CUSTOMER COPY</p></div>
      <div class="stub-stack">
        <div><p class="stub-label">PASSENGER</p><p class="stub-value">${escapeHtml(packageFolder.customer_name || 'Customer')}</p></div>
        <div><p class="stub-label">REFERENCE</p><p class="stub-value">${escapeHtml(packageFolder.package_reference)}</p></div>
        <div><p class="stub-label">BOOKING ID</p><p class="stub-value">${escapeHtml(data.bookingId || 'N/A')}</p></div>
        <div><p class="stub-label">VEHICLE</p><p class="stub-value">${escapeHtml(vehicle)}</p></div>
        <div><p class="stub-label">BAGGAGE</p><p class="stub-value" style="font-size:12px">${escapeHtml(data.maxBags || '0')} Bags Max (${escapeHtml(data.extraBaggageFee || DEFAULT_EXTRA_BAGGAGE_FEE)})</p></div>
      </div>
    </div>
	    <div class="qr-wrap">
	      <div class="qr">${qrContent}</div>
	    </div>
	  </aside>
	</main><div class="cut-divider" aria-hidden="true"></div>${accessVoucherHtml}</div>${continuationSheetsHtml}</body></html>`
}

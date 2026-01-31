import React from 'react'

export function StatementPrintStyles() {
  return (
    <style jsx>{`
      @media print {
        /* Core page setup */
        html, body {
          margin: 0;
          padding: 0;
          background: white !important;
          color: black !important;
          width: 100%;
        }
        
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        
        /* Color preservation for print */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        /* Hide screen-only elements */
        .print\\:hidden {
          display: none !important;
        }
        
        /* Container sizing */
        .min-h-screen {
          min-height: auto;
          height: auto;
        }
        
        .max-w-4xl {
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 8mm !important;
        }
        
        /* Letterhead section */
        .border-b-2 {
          border-bottom: 2px solid #000 !important;
          page-break-after: avoid;
          margin-bottom: 9px !important;
          padding-bottom: 7px !important;
        }
        
        img {
          max-width: 160px !important;
          height: auto !important;
          display: block;
        }
        
        /* Typography - Standardized sizes */
        h1, h2, h3 {
          page-break-after: avoid;
          margin: 0;
        }
        
        h2 {
          font-size: 14px !important;
          margin-bottom: 3px !important;
        }
        
        h3 {
          font-size: 12px !important;
          margin-bottom: 5px !important;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        p {
          margin: 0;
          font-size: 12px !important;
          line-height: 1.3;
        }
        
        /* Customer & Period Info Grid */
        .grid {
          page-break-inside: avoid;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 6px !important;
        }
        
        .grid > div {
          page-break-inside: avoid;
        }
        
        .grid p {
          font-size: 12px !important;
          margin: 3px 0 !important;
        }
        
        .grid .space-y-1 > p {
          margin: 2px 0 !important;
        }
        
        /* Spacing */
        .space-y-6 > * + * {
          margin-top: 7px !important;
        }
        
        .space-y-2 > * + * {
          margin-top: 3px !important;
        }
        
        .space-y-1 > * + * {
          margin-top: 2px !important;
        }
        
        /* Table Styling - Unified approach */
        table {
          width: 100%;
          border-collapse: collapse;
          page-break-inside: auto;
          margin: 7px 0 !important;
          font-family: Arial, sans-serif;
          font-size: 12px !important;
          line-height: 1.4;
          table-layout: fixed;
        }
        
        thead {
          page-break-after: avoid;
          display: table-header-group;
        }
        
        tbody {
          display: table-row-group;
        }
        
        tr {
          page-break-inside: avoid;
        }
        
        th {
          background-color: #e5e7eb !important;
          color: #000 !important;
          font-weight: 700;
          font-size: 12px !important;
          padding: 5px 6px !important;
          text-align: left;
          border-bottom: 2px solid #000 !important;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        td {
          padding: 5px 6px !important;
          border-bottom: 1px solid #d1d5db !important;
          font-size: 12px !important;
          text-align: left;
          line-height: 1.3;
        }
        
        /* Table column specifics */
        td:nth-child(4),
        td:nth-child(5) {
          text-align: right;
          font-family: 'Courier New', monospace;
          font-size: 12px !important;
        }

        /* Column widths for alignment */
        th:nth-child(1), td:nth-child(1) { width: 14%; }
        th:nth-child(2), td:nth-child(2) { width: 16%; }
        th:nth-child(3), td:nth-child(3) { width: 40%; }
        th:nth-child(4), td:nth-child(4) { width: 15%; }
        th:nth-child(5), td:nth-child(5) { width: 15%; }
        
        /* Remove hover effects */
        tbody tr:hover {
          background-color: transparent !important;
        }
        
        /* Row backgrounds */
        .bg-blue-50 {
          background-color: #eff6ff !important;
        }
        
        .bg-blue-100 {
          background-color: #dbeafe !important;
        }
        
        /* Text colors */
        .text-red-700 {
          color: #b91c1c !important;
        }
        
        .text-green-700 {
          color: #15803d !important;
        }
        
        .text-blue-700 {
          color: #1d4ed8 !important;
        }
        
        .text-amber-700 {
          color: #b45309 !important;
        }
        
        .text-slate-600 {
          color: #475569 !important;
        }
        
        .text-slate-400 {
          color: #cbd5e1 !important;
        }
        
        /* Disclaimer box */
        .bg-amber-50 {
          background-color: #fffbeb !important;
          border-left: 3px solid #f59e0b !important;
          padding: 5px 7px !important;
          margin: 7px 0 !important;
          page-break-inside: avoid;
        }
        
        .bg-amber-50 p {
          font-size: 12px !important;
          margin: 3px 0 !important;
          line-height: 1.3;
        }
        
        .text-amber-900 {
          color: #78350f !important;
          font-weight: 600;
          font-size: 12px !important;
        }
        
        .text-amber-800 {
          color: #92400e !important;
          font-size: 12px !important;
        }
        
        /* Totals section */
        .border-t-2 {
          border-top: 2px solid #000 !important;
          page-break-before: avoid;
          margin-top: 7px !important;
          padding-top: 5px !important;
        }
        
        .border-t-2 .space-y-2 > div {
          display: flex;
          justify-content: space-between;
          font-size: 12px !important;
          margin: 3px 0 !important;
          page-break-inside: avoid;
        }
        
        .border-t-2 span {
          font-size: 12px !important;
        }
        
        .text-lg {
          font-size: 14px !important;
        }
        
        /* Badge styling */
        .px-2.py-0\\.5 {
          padding: 1px 2px !important;
          font-size: 9px !important;
        }
        
        .text-\\[11px\\] {
          font-size: 9px !important;
        }
        
        /* Font for all elements */
        body, p, td, th, span, div {
          font-family: Arial, sans-serif !important;
        }
      }
    `}</style>
  )
}

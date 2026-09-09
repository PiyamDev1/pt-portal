'use client'

import { useEffect, useRef } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

export const POS_TOUR_VERSION = '2026090902'

export const POS_TOUR_CHAPTERS = [
  { label: 'Orientation', start: 0 },
  { label: 'Till status and opening', start: 3 },
  { label: 'Categories and services', start: 6 },
  { label: 'Loyalty scanner', start: 10 },
  { label: 'Customer details', start: 13 },
  { label: 'Payments and remittance', start: 18 },
  { label: 'Review and post', start: 24 },
  { label: 'Pay supplier', start: 27 },
  { label: 'Ledger', start: 33 },
  { label: 'Details and refunds', start: 40 },
  { label: 'Workspace tools', start: 44 },
] as const

type TourDefinition = {
  chapter: string
  title: string
  description: string
  target: string
}

const DEFINITIONS: TourDefinition[] = [
  {
    chapter: 'Orientation',
    title: 'Welcome to the live POS',
    description:
      'This guided tour points at the real controls. Nothing can be posted or changed while the tour is running.',
    target: 'header',
  },
  {
    chapter: 'Orientation',
    title: 'Your branch',
    description: 'Every transaction, till and ledger row belongs to the branch shown here.',
    target: 'branch',
  },
  {
    chapter: 'Orientation',
    title: 'Live-data status',
    description: 'Check the sync time before starting. Refresh if the status looks stale.',
    target: 'sync',
  },
  {
    chapter: 'Till status and opening',
    title: 'Workspace navigation',
    description: 'These buttons open the till, cash, refund, report and audit workspaces.',
    target: 'workspace-nav',
  },
  {
    chapter: 'Till status and opening',
    title: 'Open till',
    description: 'A till must be open before a live transaction can be posted.',
    target: 'nav-open-till',
  },
  {
    chapter: 'Till status and opening',
    title: 'Till totals',
    description: 'Cash, card, bank and net movement update from posted ledger tenders.',
    target: 'summaries',
  },
  {
    chapter: 'Categories and services',
    title: 'Choose the purpose',
    description: 'Start with the plain-language category that best describes the customer request.',
    target: 'categories',
  },
  {
    chapter: 'Categories and services',
    title: 'Six clear categories',
    description:
      'Applications, Ticketing & Packages, Remittance, Cargo, Document Assistance and Other keep the choice simple.',
    target: 'category-grid',
  },
  {
    chapter: 'Categories and services',
    title: 'Choose a service',
    description:
      'Expanded categories show a compact coloured service list. A sole active service is selected automatically.',
    target: 'category-grid',
  },
  {
    chapter: 'Categories and services',
    title: 'Pay supplier is separate',
    description:
      'Use this prominent action for supplier deposits and payments; it is not a customer service category.',
    target: 'pay-supplier',
  },
  {
    chapter: 'Loyalty scanner',
    title: 'Scanner is normally disarmed',
    description:
      'A customer-facing barcode scanner cannot type into the POS until you deliberately arm it.',
    target: 'loyalty',
  },
  {
    chapter: 'Loyalty scanner',
    title: 'Allow one scan',
    description:
      'Select Scan loyalty card to accept one code for 30 seconds. Escape cancels the window.',
    target: 'loyalty',
  },
  {
    chapter: 'Loyalty scanner',
    title: 'Loyalty on remittance',
    description:
      'Remittance points use the complete remittance amount and the configured points-per-GBP rate.',
    target: 'loyalty',
  },
  {
    chapter: 'Customer details',
    title: 'Customer or payee',
    description:
      'Enter the customer name. In supplier mode this area identifies the payee or source.',
    target: 'customer-name',
  },
  {
    chapter: 'Customer details',
    title: 'Transaction total',
    description:
      'Enter the full service total. Supplier deposit corrections are entered as a negative value.',
    target: 'amount',
  },
  {
    chapter: 'Customer details',
    title: 'Amount received',
    description:
      'For customer receipts, record what was actually received. Linked source systems own any remaining balance.',
    target: 'amount-paid',
  },
  {
    chapter: 'Customer details',
    title: 'Source reference',
    description:
      'Ticketing, packages and applications require their protected source reference so the transaction is traceable.',
    target: 'quick-entry',
  },
  {
    chapter: 'Customer details',
    title: 'Notes and evidence',
    description:
      'Use the note for useful context. Expenses and negative supplier corrections require one.',
    target: 'note',
  },
  {
    chapter: 'Payments and remittance',
    title: 'Payment method',
    description: 'Choose Cash, Card, Bank or Split. Other is retained only for historical imports.',
    target: 'payment-methods',
  },
  {
    chapter: 'Payments and remittance',
    title: 'Cash',
    description: 'Cash always belongs to our till and changes the expected drawer balance.',
    target: 'payment-methods',
  },
  {
    chapter: 'Payments and remittance',
    title: 'Card',
    description:
      'Normal card receipts go to our account. Remittance card defaults directly to the selected provider.',
    target: 'payment-methods',
  },
  {
    chapter: 'Payments and remittance',
    title: 'Bank',
    description:
      'Normal bank receipts go to our account. Remittance bank defaults directly to the provider.',
    target: 'payment-methods',
  },
  {
    chapter: 'Payments and remittance',
    title: 'Split tender',
    description:
      'Split separates cash, card and bank amounts. Cash remains ours; remittance non-cash parts can be provider-direct.',
    target: 'payment-methods',
  },
  {
    chapter: 'Payments and remittance',
    title: 'Remittance destination',
    description:
      'A visible destination choice confirms Provider direct or Our account. Double-click Card, Bank or Split as a shortcut.',
    target: 'payment-methods',
  },
  {
    chapter: 'Review and post',
    title: 'Money direction',
    description: 'This badge states whether the entry moves money in or out before you post it.',
    target: 'quick-header',
  },
  {
    chapter: 'Review and post',
    title: 'Review the impact',
    description: 'Check the method, destination, amount and loyalty points in this final summary.',
    target: 'post-summary',
  },
  {
    chapter: 'Review and post',
    title: 'Post once',
    description:
      'Post transaction is idempotent. Network uncertainty is kept in the retry queue instead of creating duplicates.',
    target: 'post-button',
  },
  {
    chapter: 'Pay supplier',
    title: 'Start supplier payment',
    description: 'Select Pay supplier without losing the customer category rail.',
    target: 'pay-supplier',
  },
  {
    chapter: 'Pay supplier',
    title: 'Supplier category',
    description: 'Choose Ticketing & Packages, Remittance or Cargo inside Quick Transaction.',
    target: 'quick-entry',
  },
  {
    chapter: 'Pay supplier',
    title: 'Filtered supplier',
    description: 'Only suppliers assigned to the chosen category can be selected.',
    target: 'quick-entry',
  },
  {
    chapter: 'Pay supplier',
    title: 'Deposit accounts',
    description:
      'Positive values add to a tracked supplier deposit balance. There is no separate Use balance action.',
    target: 'quick-entry',
  },
  {
    chapter: 'Pay supplier',
    title: 'Deposit correction',
    description:
      'Enter a negative amount when a supplier returns funds or a deposit needs correcting, then add a clear note.',
    target: 'amount',
  },
  {
    chapter: 'Pay supplier',
    title: 'Other ticketing source',
    description:
      'Other – enter source remembers prior names but stays pay-on-demand and does not create a balance account.',
    target: 'customer-name',
  },
  {
    chapter: 'Ledger',
    title: 'Daily ledger',
    description:
      'The ledger shows complete transactions, including remittance amounts paid directly to a provider.',
    target: 'ledger',
  },
  {
    chapter: 'Ledger',
    title: 'Search',
    description: 'Search reference, customer, service, supplier, note or source.',
    target: 'ledger-search',
  },
  {
    chapter: 'Ledger',
    title: 'Quick filters',
    description: 'Use All, Cash, Card, Bank and Outgoing for common views.',
    target: 'ledger-filters',
  },
  {
    chapter: 'Ledger',
    title: 'Advanced filters',
    description: 'Filter category, status, supplier, till, agent, source, loyalty or amount.',
    target: 'ledger-filters',
  },
  {
    chapter: 'Ledger',
    title: 'Day or month',
    description: 'Switch the period and move backward or forward without mixing business dates.',
    target: 'ledger-period',
  },
  {
    chapter: 'Ledger',
    title: 'Resize the ledger',
    description: 'Drag this bar down for more rows. The height is saved; double-click resets it.',
    target: 'ledger-resize',
  },
  {
    chapter: 'Ledger',
    title: 'Select a row',
    description:
      'Select a ledger row to inspect its tenders, source links, refunds and audit trail.',
    target: 'ledger-rows',
  },
  {
    chapter: 'Details and refunds',
    title: 'Transaction details',
    description:
      'The expanded panel preserves the category, service, supplier and source labels captured at posting time.',
    target: 'transaction-details',
  },
  {
    chapter: 'Details and refunds',
    title: 'Tender destination badge',
    description:
      'Provider direct identifies money that did not enter our account and is excluded from our reconciliation totals.',
    target: 'transaction-details',
  },
  {
    chapter: 'Details and refunds',
    title: 'Receipt',
    description: 'Open a printable receipt from the original immutable transaction.',
    target: 'transaction-details',
  },
  {
    chapter: 'Details and refunds',
    title: 'Controlled refund',
    description:
      'Refund starts from the original row whenever possible. The Other shortcut opens the same controlled workflow.',
    target: 'transaction-details',
  },
  {
    chapter: 'Workspace tools',
    title: 'Daily transactions',
    description: 'Return here for customer receipts, supplier payments and ledger follow-up.',
    target: 'nav-daily-transactions',
  },
  {
    chapter: 'Workspace tools',
    title: 'Open till',
    description: 'Open the assigned till and record its starting float.',
    target: 'nav-open-till',
  },
  {
    chapter: 'Workspace tools',
    title: 'Closeout',
    description: 'Count the drawer and reserve, then submit variances for independent approval.',
    target: 'nav-closeout',
  },
  {
    chapter: 'Workspace tools',
    title: 'Cash management',
    description:
      'Extra Coins lives here only, as a drawer-to-reserve or reserve-to-drawer transfer.',
    target: 'nav-cash-management',
  },
  {
    chapter: 'Workspace tools',
    title: 'Refunds and corrections',
    description:
      'Linked refunds, exceptional general refunds and expense corrections retain evidence and approvals here.',
    target: 'nav-refunds-corrections',
  },
  {
    chapter: 'Workspace tools',
    title: 'Reports',
    description:
      'Reports separate money that reached our accounts from provider-direct remittance tenders.',
    target: 'nav-reports',
  },
  {
    chapter: 'Workspace tools',
    title: 'Unreconciled',
    description:
      'Review card and bank tenders that still need reconciliation. Provider-direct remittance tenders stay separate.',
    target: 'nav-unreconciled',
  },
  {
    chapter: 'Workspace tools',
    title: 'Import history and tutorial complete',
    description:
      'Managers can review legacy imports here. You can replay any chapter from Help; tick below only if the tour should not start automatically again.',
    target: 'nav-import-history',
  },
]

if (DEFINITIONS.length !== 52) throw new Error('The POS guided tour must contain exactly 52 steps.')
export const POS_TOUR_STEP_COUNT = DEFINITIONS.length

export function posTourStorageKey(employeeId: string) {
  return `pt-portal:pos:tutorial:${POS_TOUR_VERSION}:${employeeId}`
}

export default function PosGuidedTour({
  employeeId,
  startIndex,
  onExit,
}: {
  employeeId: string
  startIndex: number
  onExit: () => void
}) {
  const exitRef = useRef(onExit)

  useEffect(() => {
    exitRef.current = onExit
  }, [onExit])

  useEffect(() => {
    let completed = false
    const steps: DriveStep[] = DEFINITIONS.map((definition, index) => ({
      element: () =>
        (document.querySelector(`[data-pos-tour="${definition.target}"]`) ||
          document.querySelector('[data-pos-tour="header"]') ||
          document.body) as Element,
      popover: {
        title: `${definition.chapter} · ${definition.title}`,
        description:
          index === DEFINITIONS.length - 1
            ? `${definition.description}<label class="pos-tour-dismiss"><input id="pos-tour-dismiss" type="checkbox" /> Do not show this tutorial automatically again</label>`
            : definition.description,
        side: index < 3 ? 'bottom' : 'top',
        align: 'start',
      },
    }))
    const tour = driver({
      steps,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      allowScroll: true,
      disableActiveInteraction: true,
      allowKeyboardControl: true,
      skipMissingElement: false,
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Previous',
      doneBtnText: 'Finish',
      popoverClass: 'pos-guided-tour',
      overlayColor: '#0f172a',
      overlayOpacity: 0.72,
      stagePadding: 7,
      stageRadius: 12,
      onDoneClick: () => {
        completed = true
        const dismiss = document.querySelector<HTMLInputElement>('#pos-tour-dismiss')?.checked
        if (dismiss) window.localStorage.setItem(posTourStorageKey(employeeId), 'true')
        tour.destroy()
      },
      onDestroyed: () => {
        // Closing early deliberately does not persist the preference.
        if (!completed) document.querySelector<HTMLInputElement>('#pos-tour-dismiss')?.blur()
        exitRef.current()
      },
    })
    tour.drive(Math.min(Math.max(startIndex, 0), DEFINITIONS.length - 1))
    return () => {
      if (tour.isActive()) tour.destroy()
    }
  }, [employeeId, startIndex])

  return null
}

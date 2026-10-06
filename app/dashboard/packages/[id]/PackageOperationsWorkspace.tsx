'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  AlertTriangle,
  BadgePercent,
  Check,
  ExternalLink,
  FileClock,
  GripVertical,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppDialog } from '@/components/AppDialog'
import type {
  TravelPackageAuditEvent,
  TravelPackageCommunication,
  TravelPackageDeadline,
  TravelPackageFolder,
  TravelPackageFolderStatus,
  TravelPackageInvoice,
  TravelPackagePassenger,
  TravelPackagePassengerType,
  TravelPackagePayment,
  TravelPackagePaymentMethod,
  TravelPackagePaymentPlan,
  TravelPackagePaymentStatus,
  TravelPackagePaymentType,
  TravelPackageReservation,
  TravelPackageRiskFlag,
  TravelPackageTask,
  TravelPackageTransportVoucher,
  TravelPackageTransportVoucherData,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import {
  calculatePackagePaymentSummary,
  getTravelPackageStatusTransitions,
  getPackageCommissionPayoutDate,
} from '@/lib/packageWorkflow'
import {
  cleanTransportVoucherVehicleLabel,
  createDefaultTransportVoucherData,
  getPackageDocumentPortalUrl,
  renderTransportVoucherHtml,
} from '@/lib/packageTransportVoucher'
import {
  PASSPORT_STATUSES,
  TABS,
  TRANSPORT_VEHICLES,
  dateInput,
  dateTimeInput,
  employeeLabel,
  emptyVoucher,
  formatDateTime,
  formatVoucherPassengers,
  getVehicleCapacity,
  label,
  packageStatusLabel,
  normalizeVoucherVehicleFields,
  readApiResponse,
  type OperationsResponse,
  type WorkspaceTab,
} from './packageOperationsModel'
import { getReservationCalculationTotals } from './packageOverviewModel'
import type { PackageEmployeeOption, PackageLocationOption } from './packageOverviewTypes'
import {
  getPackageCommissionEventErrorLabel,
  getPackageCommissionIssueLabel,
  parsePackageCommissionReadiness,
  type PackageCommissionReadiness,
} from '@/lib/commissions/packageReadiness'
import { PackageTasksPanel, type PackageTaskForm } from './PackageTasksPanel'
import { PackageDeadlinesPanel, type PackageDeadlineForm } from './PackageDeadlinesPanel'
import {
  PackageCommunicationPanel,
  type PackageCommunicationForm,
} from './PackageCommunicationPanel'
import {
  PackagePassengerCreatePanel,
  type PackagePassengerCreateForm,
} from './PackagePassengerCreatePanel'
import { PackagePassengerTable, type PackagePassengerEditForm } from './PackagePassengerTable'
import { PackagePaymentTable, type PackagePaymentEditForm } from './PackagePaymentTable'
import { PackagePaymentEntryForm, type PackagePaymentCreateForm } from './PackagePaymentEntryForm'
import {
  PackageInstallmentPlanPanel,
  type PackageInstallmentPlanForm,
} from './PackageInstallmentPlanPanel'

type Props = {
  packageFolder: TravelPackageFolder
  invoice: TravelPackageInvoice | null
  reservations?: TravelPackageReservation[]
  employees?: PackageEmployeeOption[]
  locations?: PackageLocationOption[]
  onPackageChange: (packageFolder: TravelPackageFolder) => void
  onInvoiceChange?: (invoice: TravelPackageInvoice) => void
  onOpenReservations?: () => void
}

function commissionReadinessCopy(readiness: PackageCommissionReadiness) {
  switch (readiness.state) {
    case 'ready_to_close':
      return {
        title: 'Ready for Commission handoff',
        detail:
          'After the customer returns, mark the folder Complete - Checked. Commission is then calculated from the reservation records and dated three days after return.',
        style: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      }
    case 'processed':
      return {
        title: 'Commission shadow calculation completed',
        detail:
          'This Complete - Checked package has been calculated from its reservation records and is visible to Commission Admin.',
        style: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      }
    case 'processing':
      return {
        title: 'Commission calculation in progress',
        detail: 'The source is being checked against the employee commission plan.',
        style: 'border-cyan-200 bg-cyan-50 text-cyan-950',
      }
    case 'awaiting_processing':
      return {
        title: 'Sent to Commission',
        detail: 'The source is queued for its non-payable shadow calculation.',
        style: 'border-cyan-200 bg-cyan-50 text-cyan-950',
      }
    case 'held':
      return {
        title: 'Commission Admin review needed',
        detail: 'The source is retained safely but cannot be calculated yet.',
        style: 'border-amber-200 bg-amber-50 text-amber-950',
      }
    case 'rejected':
      return {
        title: 'Commission handoff rejected',
        detail: 'Commission Admin needs to review this source record.',
        style: 'border-red-200 bg-red-50 text-red-950',
      }
    default:
      return {
        title: 'Commission handoff needs attention',
        detail:
          readiness.stage === 'closed'
            ? 'The closed package is retained but its Commission calculation will be held.'
            : 'Resolve these source checks for a clean handoff when the package is closed.',
        style: 'border-amber-200 bg-amber-50 text-amber-950',
      }
  }
}

export default function PackageOperationsWorkspace({
  packageFolder,
  invoice,
  reservations = [],
  employees = [],
  locations = [],
  onPackageChange,
  onInvoiceChange,
  onOpenReservations,
}: Props) {
  const { confirm, prompt, dialog } = useAppDialog()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('control')
  const [passengers, setPassengers] = useState<TravelPackagePassenger[]>([])
  const [payments, setPayments] = useState<TravelPackagePayment[]>([])
  const [tasks, setTasks] = useState<TravelPackageTask[]>([])
  const [deadlines, setDeadlines] = useState<TravelPackageDeadline[]>([])
  const [risks, setRisks] = useState<TravelPackageRiskFlag[]>([])
  const [communications, setCommunications] = useState<TravelPackageCommunication[]>([])
  const [auditEvents, setAuditEvents] = useState<TravelPackageAuditEvent[]>([])
  const [vouchers, setVouchers] = useState<TravelPackageTransportVoucher[]>([])
  const [paymentPlan, setPaymentPlan] = useState<TravelPackagePaymentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [commissionReadiness, setCommissionReadiness] = useState<PackageCommissionReadiness | null>(
    null,
  )
  const [commissionReadinessLoading, setCommissionReadinessLoading] = useState(true)
  const [commissionReadinessError, setCommissionReadinessError] = useState<string | null>(null)
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null)
  const [editingPassengerId, setEditingPassengerId] = useState<string | null>(null)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [showAddPassengerForm, setShowAddPassengerForm] = useState(false)
  const [selectedPassengerFamilyQuoteId, setSelectedPassengerFamilyQuoteId] = useState('')
  const [selectedPaymentFamilyQuoteId, setSelectedPaymentFamilyQuoteId] = useState('')
  const [draggedVoucherSegmentIndex, setDraggedVoucherSegmentIndex] = useState<number | null>(null)
  const [voucherPreviewQrCodeDataUrl, setVoucherPreviewQrCodeDataUrl] = useState('')
  const [accessVoucherQrCodeDataUrl, setAccessVoucherQrCodeDataUrl] = useState('')

  const [customerForm, setCustomerForm] = useState({
    customerName: packageFolder.customer_name || '',
    customerPhone: packageFolder.customer_phone || '',
    customerEmail: packageFolder.customer_email || '',
    destination: packageFolder.destination || '',
    departureDate: dateInput(packageFolder.departure_date),
    returnDate: dateInput(packageFolder.return_date),
  })
  const [passengerForm, setPassengerForm] = useState<PackagePassengerCreateForm>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    passengerType: 'adult' as TravelPackagePassengerType,
  })
  const [passengerEditForm, setPassengerEditForm] = useState<PackagePassengerEditForm>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    passengerType: 'adult' as TravelPackagePassengerType,
    roomAllocation: '',
    internalNotes: '',
  })
  const [paymentForm, setPaymentForm] = useState<PackagePaymentCreateForm>({
    amount: '',
    paymentType: 'deposit' as TravelPackagePaymentType,
    paymentMethod: 'bank_transfer' as TravelPackagePaymentMethod,
    paymentStatus: 'completed' as TravelPackagePaymentStatus,
    dueAt: '',
    installmentId: '',
    receiptReference: '',
    notes: '',
  })
  const [paymentEditForm, setPaymentEditForm] = useState<PackagePaymentEditForm>({
    amount: '',
    paymentType: 'payment' as TravelPackagePaymentType,
    paymentMethod: 'bank_transfer' as TravelPackagePaymentMethod,
    paymentStatus: 'completed' as TravelPackagePaymentStatus,
    dueAt: '',
    receivedAt: '',
    receiptReference: '',
    notes: '',
  })
  const [planForm, setPlanForm] = useState<PackageInstallmentPlanForm>({
    totalAmount: '',
    depositAmount: '',
    installmentCount: '3',
    frequency: 'monthly',
    startsOn: dateInput(new Date().toISOString()),
    lmsPlanId: '',
    internalNotes: '',
  })
  const [taskForm, setTaskForm] = useState<PackageTaskForm>({
    title: '',
    dueAt: '',
    priority: 'medium',
  })
  const [deadlineForm, setDeadlineForm] = useState<PackageDeadlineForm>({
    title: '',
    dueAt: '',
    severity: 'medium',
  })
  const [communicationForm, setCommunicationForm] = useState<PackageCommunicationForm>({
    summary: '',
    channel: 'whatsapp',
    direction: 'outbound',
    followUpRequired: false,
    followUpDueAt: '',
  })
  const [voucherForm, setVoucherForm] = useState<TravelPackageTransportVoucherData>(emptyVoucher)
  const [voucherRoutesText, setVoucherRoutesText] = useState('')

  const loadCommissionReadiness = useCallback(async () => {
    setCommissionReadinessLoading(true)
    try {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/commission-readiness`,
        { cache: 'no-store' },
      )
      const data = (await readApiResponse(response)) as {
        readiness?: unknown
        error?: string
      }
      if (!response.ok) throw new Error(data.error || 'Unable to check Commission readiness')
      const readiness = parsePackageCommissionReadiness(data.readiness)
      if (!readiness) throw new Error('Commission readiness returned an invalid response')
      setCommissionReadiness(readiness)
      setCommissionReadinessError(null)
      return readiness
    } catch (error) {
      setCommissionReadinessError(
        error instanceof Error ? error.message : 'Unable to check Commission readiness',
      )
      return null
    } finally {
      setCommissionReadinessLoading(false)
    }
  }, [packageFolder.id])

  const loadWorkspace = async () => {
    setLoading(true)
    try {
      const [
        passengerResponse,
        paymentResponse,
        operationsResponse,
        voucherResponse,
        planResponse,
      ] = await Promise.all([
        fetch(`/api/travel-packages/${packageFolder.id}/passengers`),
        fetch(`/api/travel-packages/${packageFolder.id}/payments`),
        fetch(`/api/travel-packages/${packageFolder.id}/operations`),
        fetch(`/api/travel-packages/${packageFolder.id}/transport-vouchers`),
        fetch(`/api/travel-packages/${packageFolder.id}/payment-plan`),
      ])
      const [passengerData, paymentData, operationData, voucherData, planData] = (await Promise.all(
        [
          readApiResponse(passengerResponse),
          readApiResponse(paymentResponse),
          readApiResponse(operationsResponse),
          readApiResponse(voucherResponse),
          readApiResponse(planResponse),
        ],
      )) as [
        {
          passengers?: TravelPackagePassenger[]
          setupRequired?: boolean
          message?: string
          error?: string
        },
        {
          payments?: TravelPackagePayment[]
          setupRequired?: boolean
          message?: string
          error?: string
        },
        OperationsResponse,
        {
          vouchers?: TravelPackageTransportVoucher[]
          setupRequired?: boolean
          message?: string
          error?: string
        },
        { plan?: TravelPackagePaymentPlan | null; error?: string },
      ]
      const failed = [passengerResponse, paymentResponse, operationsResponse, planResponse].find(
        (response) => !response.ok,
      )
      if (failed) {
        const responseData = [passengerData, paymentData, operationData, planData][
          [passengerResponse, paymentResponse, operationsResponse, planResponse].indexOf(failed)
        ]
        throw new Error(responseData.error || 'Failed to load package operations')
      }
      setPassengers(passengerData.passengers || [])
      setPayments(paymentData.payments || [])
      setTasks(operationData.tasks || [])
      setDeadlines(operationData.deadlines || [])
      setRisks(operationData.risks || [])
      setCommunications(operationData.communications || [])
      setAuditEvents(operationData.auditEvents || [])
      setVouchers(voucherResponse.ok ? voucherData.vouchers || [] : [])
      setPaymentPlan(planData.plan || null)
      if (!voucherResponse.ok) {
        toast.error(voucherData.error || 'Failed to load transport vouchers')
      }
      setSetupMessage(
        passengerData.setupRequired ||
          paymentData.setupRequired ||
          operationData.setupRequired ||
          voucherData.setupRequired ||
          !voucherResponse.ok
          ? passengerData.message ||
              paymentData.message ||
              operationData.message ||
              voucherData.message ||
              voucherData.error ||
              'Complete package workflow migration required.'
          : null,
      )
      const latestVoucher = voucherResponse.ok ? voucherData.vouchers?.[0] : null
      if (latestVoucher) {
        const normalizedVoucherData = normalizeVoucherVehicleFields(latestVoucher.voucher_data)
        setEditingVoucherId(latestVoucher.id)
        setVoucherForm(normalizedVoucherData)
        setVoucherRoutesText(
          (
            normalizedVoucherData.routes ||
            normalizedVoucherData.itinerary?.map((item) => item.description) ||
            []
          ).join('\n'),
        )
      } else {
        setEditingVoucherId(null)
        const defaultVoucher = createDefaultTransportVoucherData(packageFolder)
        setVoucherForm(defaultVoucher)
        setVoucherRoutesText(defaultVoucher.routes.join('\n'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load package operations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadWorkspace()
    // package ID is the stable workspace identity; local mutations refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageFolder.id])

  useEffect(() => {
    void loadCommissionReadiness()
  }, [loadCommissionReadiness, packageFolder.updated_at, passengers, payments, reservations])

  const groupFamilies = useMemo(
    () => packageFolder.selected_quote_snapshot?.group?.families || [],
    [packageFolder.selected_quote_snapshot?.group?.families],
  )
  const selectedPaymentFamily = groupFamilies.find(
    (family) => family.quoteId === selectedPaymentFamilyQuoteId,
  )
  const selectedPassengerFamily = groupFamilies.find(
    (family) => family.quoteId === selectedPassengerFamilyQuoteId,
  )
  const familyByQuoteId = useMemo(
    () => new Map(groupFamilies.map((family) => [family.quoteId, family])),
    [groupFamilies],
  )
  const visiblePayments = useMemo(
    () =>
      selectedPaymentFamilyQuoteId && selectedPaymentFamilyQuoteId !== 'all'
        ? payments.filter((payment) => payment.quote_id === selectedPaymentFamilyQuoteId)
        : payments,
    [payments, selectedPaymentFamilyQuoteId],
  )
  const paymentSummary = useMemo(
    () => calculatePackagePaymentSummary(visiblePayments),
    [visiblePayments],
  )
  const packagePaymentSummary = useMemo(() => calculatePackagePaymentSummary(payments), [payments])
  const selectedFamilyInvoice =
    selectedPaymentFamily && invoice?.quote_id === selectedPaymentFamily.quoteId ? invoice : null
  const reservationSaleTotal = (quoteId?: string) =>
    reservations
      .filter((reservation) => !quoteId || reservation.quote_id === quoteId)
      .reduce(
        (total, reservation) =>
          total +
          Math.max(
            0,
            Number(reservation.sold_price_total || 0) -
              Number(reservation.discount_total || 0) -
              Number(reservation.customer_refund_total || 0),
          ),
        0,
      )
  const selectedFamilyReservationTotal = selectedPaymentFamily
    ? reservationSaleTotal(selectedPaymentFamily.quoteId)
    : 0
  const calculationTotals = getReservationCalculationTotals(
    reservations,
    packagePaymentSummary.netPaid,
  )
  const groupReservationTotal = Math.max(0, calculationTotals.netSold)
  const reservationDiscountTotal = selectedPaymentFamily
    ? reservations
        .filter((reservation) => reservation.quote_id === selectedPaymentFamily.quoteId)
        .reduce((total, reservation) => total + Number(reservation.discount_total || 0), 0)
    : calculationTotals.discount
  const paymentTotalDue = selectedPaymentFamily
    ? selectedFamilyReservationTotal
    : groupReservationTotal
  const paymentBalance = Math.max(0, paymentTotalDue - paymentSummary.netPaid)
  const unrequestedPaymentBalance = Math.max(0, paymentBalance - paymentSummary.pending)
  const paymentCurrency =
    reservations.find(
      (reservation) =>
        !selectedPaymentFamily || reservation.quote_id === selectedPaymentFamily.quoteId,
    )?.currency || paymentSummary.currency
  const packageCurrency = reservations[0]?.currency || invoice?.currency || 'GBP'

  useEffect(() => {
    if (groupFamilies.length === 0) {
      if (selectedPaymentFamilyQuoteId) setSelectedPaymentFamilyQuoteId('')
      return
    }
    if (
      selectedPaymentFamilyQuoteId !== 'all' &&
      !groupFamilies.some((family) => family.quoteId === selectedPaymentFamilyQuoteId)
    ) {
      setSelectedPaymentFamilyQuoteId(groupFamilies[0].quoteId)
    }
  }, [groupFamilies, selectedPaymentFamilyQuoteId])
  useEffect(() => {
    if (groupFamilies.length === 0) {
      if (selectedPassengerFamilyQuoteId) setSelectedPassengerFamilyQuoteId('')
      return
    }
    if (!groupFamilies.some((family) => family.quoteId === selectedPassengerFamilyQuoteId)) {
      setSelectedPassengerFamilyQuoteId(groupFamilies[0].quoteId)
    }
  }, [groupFamilies, selectedPassengerFamilyQuoteId])
  useEffect(() => {
    if (!onInvoiceChange || !selectedPaymentFamilyQuoteId || selectedPaymentFamilyQuoteId === 'all')
      return
    let cancelled = false
    const loadFamilyInvoice = async () => {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/invoice?quoteId=${encodeURIComponent(selectedPaymentFamilyQuoteId)}`,
      )
      const data = (await response.json()) as { invoice?: TravelPackageInvoice | null }
      if (!cancelled && response.ok && data.invoice) onInvoiceChange(data.invoice)
    }
    void loadFamilyInvoice()
    return () => {
      cancelled = true
    }
  }, [onInvoiceChange, packageFolder.id, selectedPaymentFamilyQuoteId])
  const openTasks = tasks.filter((task) => ['open', 'in_progress', 'blocked'].includes(task.status))
  const openRisks = risks.filter((risk) => risk.status !== 'resolved')
  const commissionReadinessDisplay = commissionReadiness
    ? commissionReadinessCopy(commissionReadiness)
    : null
  const commissionEventError = getPackageCommissionEventErrorLabel(
    commissionReadiness?.eventError || null,
  )
  const packageLocation = locations.find((location) => location.id === packageFolder.location_id)
  const salesEmployee = employees.find(
    (employee) =>
      employee.id ===
      (packageFolder.sales_responsible_employee_id ||
        packageFolder.sales_employee_id ||
        packageFolder.assigned_agent_id),
  )
  const suggestedLocation = salesEmployee?.location_id
    ? locations.find((location) => location.id === salesEmployee.location_id)
    : null
  const availableStatuses = [
    packageFolder.status,
    ...getTravelPackageStatusTransitions(packageFolder.status),
  ]
  const responsibilityFields = [
    {
      label: 'Sales',
      helper: 'Who sold/finalised the package',
      value: packageFolder.sales_responsible_employee_id || packageFolder.sales_employee_id || '',
      bodyKey: 'salesResponsibleEmployeeId',
    },
    {
      label: 'Booking',
      helper: 'Who is making reservations',
      value: packageFolder.booking_responsible_employee_id || '',
      bodyKey: 'bookingResponsibleEmployeeId',
    },
    {
      label: 'Modify',
      helper: 'Who handles changes/amendments',
      value: packageFolder.modify_responsible_employee_id || '',
      bodyKey: 'modifyResponsibleEmployeeId',
    },
    {
      label: 'Service',
      helper: 'Who looks after customer service',
      value: packageFolder.service_responsible_employee_id || '',
      bodyKey: 'serviceResponsibleEmployeeId',
    },
  ]
  const selectedVehicle = getVehicleCapacity(voucherForm.vehicle || voucherForm.vehicleType)
  const voucherSeatPassengers = Number(voucherForm.adults || 0) + Number(voucherForm.children || 0)
  const voucherPassengerError =
    selectedVehicle && voucherSeatPassengers > selectedVehicle.passengers
      ? `Exceeds capacity of ${selectedVehicle.passengers}. Select a larger vehicle.`
      : ''
  const selectedVoucher = vouchers.find((voucher) => voucher.id === editingVoucherId) || null
  const voucherDigitalUrl =
    voucherForm.digitalVoucherUrl ||
    (packageFolder.document_access_token
      ? getPackageDocumentPortalUrl(packageFolder.document_access_token)
      : getPackageDocumentPortalUrl(''))
  const voucherPreviewData = useMemo(
    () => ({
      ...voucherForm,
      digitalVoucherUrl: voucherDigitalUrl,
      qrCodeDataUrl: voucherForm.qrCodeDataUrl || voucherPreviewQrCodeDataUrl,
      accessVoucherQrCodeDataUrl,
    }),
    [accessVoucherQrCodeDataUrl, voucherDigitalUrl, voucherForm, voucherPreviewQrCodeDataUrl],
  )
  const voucherPreviewHtml = useMemo(
    () => renderTransportVoucherHtml(packageFolder, voucherPreviewData),
    [packageFolder, voucherPreviewData],
  )
  const voucherRouteAssignments = voucherForm.routeAssignments || []

  useEffect(() => {
    if (voucherForm.qrCodeDataUrl) {
      setVoucherPreviewQrCodeDataUrl(voucherForm.qrCodeDataUrl)
      return
    }

    let cancelled = false
    QRCode.toDataURL(voucherDigitalUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((value) => {
        if (!cancelled) setVoucherPreviewQrCodeDataUrl(value)
      })
      .catch(() => {
        if (!cancelled) setVoucherPreviewQrCodeDataUrl('')
      })

    return () => {
      cancelled = true
    }
  }, [voucherDigitalUrl, voucherForm.qrCodeDataUrl])

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL('https://bookings.piyamtravel.com', {
      width: 220,
      margin: 1,
      color: { dark: '#3b0a12', light: '#ffffff' },
    })
      .then((value) => {
        if (!cancelled) setAccessVoucherQrCodeDataUrl(value)
      })
      .catch(() => {
        if (!cancelled) setAccessVoucherQrCodeDataUrl('')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const patchPackage = async (body: Record<string, unknown>) => {
    setSaving('package')
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as { package?: TravelPackageFolder; error?: string }
      if (!response.ok || !data.package) throw new Error(data.error || 'Failed to update package')
      onPackageChange(data.package)
      toast.success('Package updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update package')
    } finally {
      setSaving(null)
    }
  }

  const autoResolveCommissionHandoff = async () => {
    setSaving('commission-handoff')
    try {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/commission-readiness/auto-resolve`,
        { method: 'POST' },
      )
      const data = (await readApiResponse(response)) as {
        actions?: string[]
        packagePatch?: Partial<TravelPackageFolder>
        readiness?: unknown
        error?: string
      }
      if (!response.ok) throw new Error(data.error || 'Unable to resolve Commission handoff')
      if (data.packagePatch) onPackageChange({ ...packageFolder, ...data.packagePatch })
      const readiness = parsePackageCommissionReadiness(data.readiness)
      if (readiness) setCommissionReadiness(readiness)
      if (data.actions?.length) {
        toast.success(data.actions.join(' '))
      } else if (readiness?.issues.length) {
        toast.info(
          'No safe automatic fixes remain. Follow the instructions shown for this package.',
        )
      } else {
        toast.success('Package handoff is already reconciled.')
      }
      return readiness
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to resolve Commission handoff')
      return null
    } finally {
      setSaving(null)
    }
  }

  const changePackageStatus = async (status: TravelPackageFolderStatus) => {
    if (status === 'cancelled') {
      const reason = await prompt({
        title: 'Cancel package?',
        message: 'The cancellation reason is recorded in the package audit history.',
        label: 'Cancellation reason',
        placeholder: 'Enter the reason for cancellation',
        confirmLabel: 'Cancel package',
        required: true,
      })
      if (!reason) return
      await patchPackage({ status, cancellationReason: reason })
      return
    }
    if (status === 'closed') {
      if (!packageFolder.return_date) {
        toast.error('Set the package return date before completing the final check.')
        return
      }
      const payoutDate = getPackageCommissionPayoutDate(packageFolder.return_date)
      const freshReadiness =
        (await autoResolveCommissionHandoff()) || (await loadCommissionReadiness())
      if (freshReadiness?.issues.includes('missing_sales_employee')) {
        toast.error('Assign the responsible sales employee before closing this package.')
        return
      }
      const issueSummary = !freshReadiness?.handoffReady
        ? freshReadiness?.issues.length
          ? ` ${freshReadiness.issues.length} source check${freshReadiness.issues.length === 1 ? '' : 's'} still need attention, so Commission may be held for Admin review.`
          : ' Commission readiness could not be verified.'
        : ''
      const shouldClose = await confirm({
        title: 'Mark this folder Complete - Checked?',
        message: `Confirm that you have double-checked the package folder after the customer returned.${issueSummary} Commission will be applied with a payout date of ${payoutDate || 'three days after return'}; releasing the invoice is not required.`,
        confirmLabel: 'Complete - Checked',
        type: freshReadiness?.handoffReady ? 'info' : 'warning',
      })
      if (!shouldClose) return
    }
    await patchPackage({ status })
  }

  const refreshInvoice = async (quoteId = selectedPaymentFamilyQuoteId) => {
    if (!onInvoiceChange) return
    const query = quoteId ? `?quoteId=${encodeURIComponent(quoteId)}` : ''
    const response = await fetch(`/api/travel-packages/${packageFolder.id}/invoice${query}`)
    const data = (await response.json()) as { invoice?: TravelPackageInvoice | null }
    if (response.ok && data.invoice) onInvoiceChange(data.invoice)
  }

  const refreshPaymentPlan = async () => {
    const response = await fetch(`/api/travel-packages/${packageFolder.id}/payment-plan`)
    const data = (await response.json()) as { plan?: TravelPackagePaymentPlan | null }
    if (response.ok) setPaymentPlan(data.plan || null)
  }

  const syncWorkflow = async () => {
    setSaving('sync')
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/operations/sync`, {
        method: 'POST',
      })
      const data = (await response.json()) as { package?: TravelPackageFolder; error?: string }
      if (!response.ok || !data.package)
        throw new Error(data.error || 'Failed to recalculate workflow')
      onPackageChange(data.package)
      await loadWorkspace()
      toast.success('Next action and risks recalculated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to recalculate workflow')
    } finally {
      setSaving(null)
    }
  }

  const addPassenger = async () => {
    setSaving('passenger')
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/passengers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...passengerForm,
          quoteId: selectedPassengerFamily?.quoteId || null,
          groupMemberId: selectedPassengerFamily?.memberId || null,
        }),
      })
      const data = (await response.json()) as { passenger?: TravelPackagePassenger; error?: string }
      if (!response.ok || !data.passenger) throw new Error(data.error || 'Failed to add passenger')
      setPassengers((current) => [...current, data.passenger!])
      setPassengerForm({ firstName: '', lastName: '', dateOfBirth: '', passengerType: 'adult' })
      setShowAddPassengerForm(false)
      toast.success('Passenger added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add passenger')
    } finally {
      setSaving(null)
    }
  }

  const updatePassenger = async (
    passenger: TravelPackagePassenger,
    body: Record<string, unknown>,
  ) => {
    setSaving(passenger.id)
    try {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/passengers/${passenger.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const data = (await response.json()) as { passenger?: TravelPackagePassenger; error?: string }
      if (!response.ok || !data.passenger)
        throw new Error(data.error || 'Failed to update passenger')
      setPassengers((current) =>
        current.map((item) => (item.id === passenger.id ? data.passenger! : item)),
      )
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update passenger')
      return false
    } finally {
      setSaving(null)
    }
  }

  const startPassengerEdit = (passenger: TravelPackagePassenger) => {
    setEditingPassengerId(passenger.id)
    setPassengerEditForm({
      firstName: passenger.first_name || '',
      lastName: passenger.last_name || '',
      dateOfBirth: dateInput(passenger.date_of_birth),
      passengerType: passenger.passenger_type,
      roomAllocation: passenger.room_allocation || '',
      internalNotes: passenger.internal_notes || '',
    })
  }

  const savePassengerEdit = async (passenger: TravelPackagePassenger) => {
    const updated = await updatePassenger(passenger, passengerEditForm)
    if (updated) {
      setEditingPassengerId(null)
      toast.success('Passenger updated')
    }
  }

  const deletePassenger = async (passenger: TravelPackagePassenger) => {
    const shouldDelete = await confirm({
      title: 'Delete passenger?',
      message: `Delete ${[passenger.first_name, passenger.last_name].filter(Boolean).join(' ') || 'this passenger'} from the package? This cannot be undone.`,
      confirmLabel: 'Delete passenger',
      type: 'danger',
    })
    if (!shouldDelete) return
    setSaving(passenger.id)
    try {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/passengers/${passenger.id}`,
        { method: 'DELETE' },
      )
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Failed to delete passenger')
      setPassengers((current) => current.filter((item) => item.id !== passenger.id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete passenger')
    } finally {
      setSaving(null)
    }
  }

  const addPayment = async () => {
    if (groupFamilies.length > 0 && !selectedPaymentFamily) {
      toast.error('Select a family before recording a payment or previous-refund credit.')
      return
    }
    setSaving('payment')
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentForm,
          invoiceId: selectedFamilyInvoice?.id || null,
          quoteId: selectedPaymentFamily?.quoteId || null,
          groupMemberId: selectedPaymentFamily?.memberId || null,
          currency: paymentCurrency || 'GBP',
          metadata: selectedPaymentFamily
            ? { familyLabel: selectedPaymentFamily.familyLabel }
            : undefined,
        }),
      })
      const data = (await response.json()) as { payment?: TravelPackagePayment; error?: string }
      if (!response.ok || !data.payment) throw new Error(data.error || 'Failed to record payment')
      setPayments((current) => [data.payment!, ...current])
      await refreshInvoice(selectedPaymentFamily?.quoteId)
      await refreshPaymentPlan()
      setPaymentForm({
        amount: '',
        paymentType: 'payment',
        paymentMethod: 'bank_transfer',
        paymentStatus: 'completed',
        dueAt: '',
        installmentId: '',
        receiptReference: '',
        notes: '',
      })
      toast.success('Payment recorded and reservation balance updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record payment')
    } finally {
      setSaving(null)
    }
  }

  const updatePaymentStatus = async (
    payment: TravelPackagePayment,
    paymentStatus: TravelPackagePaymentStatus,
  ) => {
    setSaving(payment.id)
    try {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/payments/${payment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentStatus }),
        },
      )
      const data = (await response.json()) as { payment?: TravelPackagePayment; error?: string }
      if (!response.ok || !data.payment) throw new Error(data.error || 'Failed to update payment')
      setPayments((current) =>
        current.map((item) => (item.id === payment.id ? data.payment! : item)),
      )
      await refreshInvoice(payment.quote_id || undefined)
      await refreshPaymentPlan()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payment')
    } finally {
      setSaving(null)
    }
  }

  const startPaymentEdit = (payment: TravelPackagePayment) => {
    setEditingPaymentId(payment.id)
    setPaymentEditForm({
      amount: String(payment.amount || ''),
      paymentType: payment.payment_type,
      paymentMethod: payment.payment_method,
      paymentStatus: payment.payment_status,
      dueAt: dateTimeInput(payment.due_at),
      receivedAt: dateTimeInput(payment.received_at),
      receiptReference: payment.receipt_reference || '',
      notes: payment.notes || '',
    })
  }

  const savePaymentEdit = async (payment: TravelPackagePayment) => {
    setSaving(payment.id)
    try {
      const paymentPayload = {
        ...paymentEditForm,
        amount: Number(paymentEditForm.amount || 0),
        receivedAt: paymentEditForm.receivedAt || undefined,
      }
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/payments/${payment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentPayload),
        },
      )
      const data = (await response.json()) as { payment?: TravelPackagePayment; error?: string }
      if (!response.ok || !data.payment) throw new Error(data.error || 'Failed to update payment')
      setPayments((current) =>
        current.map((item) => (item.id === payment.id ? data.payment! : item)),
      )
      setEditingPaymentId(null)
      await refreshInvoice(payment.quote_id || undefined)
      await refreshPaymentPlan()
      toast.success('Payment updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payment')
    } finally {
      setSaving(null)
    }
  }

  const deletePayment = async (payment: TravelPackagePayment) => {
    const shouldDelete = await confirm({
      title: 'Delete payment?',
      message: `Delete the ${formatMoney(payment.amount, payment.currency)} payment record? The Payments balance will be recalculated against reservations.`,
      confirmLabel: 'Delete payment',
      type: 'danger',
    })
    if (!shouldDelete) return
    setSaving(payment.id)
    try {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/payments/${payment.id}`,
        { method: 'DELETE' },
      )
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Failed to delete payment')
      setPayments((current) => current.filter((item) => item.id !== payment.id))
      if (editingPaymentId === payment.id) setEditingPaymentId(null)
      await refreshInvoice(payment.quote_id || undefined)
      await refreshPaymentPlan()
      toast.success('Payment deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete payment')
    } finally {
      setSaving(null)
    }
  }

  const createPaymentPlan = async () => {
    setSaving('plan')
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/payment-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...planForm,
          currency: paymentCurrency || 'GBP',
          totalAmount: Number(planForm.totalAmount),
          depositAmount: Number(planForm.depositAmount || 0),
          installmentCount: Number(planForm.installmentCount),
        }),
      })
      const data = (await response.json()) as { plan?: TravelPackagePaymentPlan; error?: string }
      if (!response.ok || !data.plan) throw new Error(data.error || 'Failed to create payment plan')
      setPaymentPlan(data.plan)
      toast.success('Installment schedule created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create payment plan')
    } finally {
      setSaving(null)
    }
  }

  const createOperation = async (
    resource: 'task' | 'deadline' | 'communication',
    body: Record<string, unknown>,
  ) => {
    setSaving(resource)
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource, ...body }),
      })
      const data = (await response.json()) as { item?: unknown; error?: string }
      if (!response.ok || !data.item) throw new Error(data.error || `Failed to create ${resource}`)
      if (resource === 'task') {
        setTasks((current) => [data.item as TravelPackageTask, ...current])
        setTaskForm({ title: '', dueAt: '', priority: 'medium' })
      } else if (resource === 'deadline') {
        setDeadlines((current) =>
          [...current, data.item as TravelPackageDeadline].sort((a, b) =>
            a.due_at.localeCompare(b.due_at),
          ),
        )
        setDeadlineForm({ title: '', dueAt: '', severity: 'medium' })
      } else {
        setCommunications((current) => [data.item as TravelPackageCommunication, ...current])
        setCommunicationForm({
          summary: '',
          channel: 'whatsapp',
          direction: 'outbound',
          followUpRequired: false,
          followUpDueAt: '',
        })
      }
      toast.success(`${label(resource)} saved`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to create ${resource}`)
    } finally {
      setSaving(null)
    }
  }

  const updateOperation = async (
    resource: 'task' | 'deadline' | 'risk',
    resourceId: string,
    body: Record<string, unknown>,
  ) => {
    setSaving(resourceId)
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource, resourceId, ...body }),
      })
      const data = (await response.json()) as { item?: unknown; error?: string }
      if (!response.ok || !data.item) throw new Error(data.error || `Failed to update ${resource}`)
      if (resource === 'task')
        setTasks((current) =>
          current.map((item) => (item.id === resourceId ? (data.item as TravelPackageTask) : item)),
        )
      if (resource === 'deadline')
        setDeadlines((current) =>
          current.map((item) =>
            item.id === resourceId ? (data.item as TravelPackageDeadline) : item,
          ),
        )
      if (resource === 'risk')
        setRisks((current) =>
          current.map((item) =>
            item.id === resourceId ? (data.item as TravelPackageRiskFlag) : item,
          ),
        )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to update ${resource}`)
    } finally {
      setSaving(null)
    }
  }

  const updateVoucherField = <Key extends keyof TravelPackageTransportVoucherData>(
    key: Key,
    value: TravelPackageTransportVoucherData[Key],
  ) => {
    setVoucherForm((current) => ({ ...current, [key]: value }))
  }

  const updateVoucherItinerary = (
    index: number,
    updates: Partial<NonNullable<TravelPackageTransportVoucherData['itinerary']>[number]>,
  ) => {
    setVoucherForm((current) => {
      const itinerary = [...(current.itinerary || [])]
      const existing = itinerary[index]
      itinerary[index] = {
        type: existing?.type || '',
        description: existing?.description || '',
        date: existing?.date || '',
        time: existing?.time || '',
        ...updates,
      }
      const routeAssignments = [...(current.routeAssignments || [])]
      const existingAssignment = routeAssignments[index]
      const fallbackVehicle = current.vehicleType || current.vehicle || ''
      routeAssignments[index] = {
        routeName: itinerary[index].description,
        type: itinerary[index].type,
        supplierName: existingAssignment?.supplierName || '',
        vehicleType: cleanTransportVoucherVehicleLabel(
          existingAssignment?.vehicleType,
          fallbackVehicle,
        ),
        date: itinerary[index].date,
        time: itinerary[index].time,
      }
      return {
        ...current,
        itinerary,
        routeAssignments,
        routes: itinerary.map((item) => item.description.trim()).filter(Boolean),
      }
    })
  }

  const updateVoucherItineraryVehicle = (index: number, vehicleType: string) => {
    setVoucherForm((current) => {
      const itineraryItem = current.itinerary?.[index]
      if (!itineraryItem) return current
      const routeAssignments = [...(current.routeAssignments || [])]
      const existingAssignment = routeAssignments[index]
      routeAssignments[index] = {
        routeName: existingAssignment?.routeName || itineraryItem.description,
        type: existingAssignment?.type || itineraryItem.type,
        supplierName: existingAssignment?.supplierName || '',
        vehicleType,
        date: existingAssignment?.date || itineraryItem.date,
        time: existingAssignment?.time || itineraryItem.time,
      }
      return { ...current, routeAssignments }
    })
  }

  const addVoucherItineraryItem = (type: string) => {
    setVoucherForm((current) => ({
      ...current,
      itinerary: [...(current.itinerary || []), { type, description: '', date: '', time: '' }],
      routeAssignments: [
        ...(current.routeAssignments || []),
        {
          routeName: '',
          type,
          supplierName: current.transportCompany || current.providerName || '',
          vehicleType: current.vehicleType || current.vehicle || '',
          date: '',
          time: '',
        },
      ],
    }))
  }

  const removeVoucherItineraryItem = (index: number) => {
    setVoucherForm((current) => {
      const itinerary = (current.itinerary || []).filter((_, itemIndex) => itemIndex !== index)
      const routeAssignments = (current.routeAssignments || []).filter(
        (_, itemIndex) => itemIndex !== index,
      )
      return {
        ...current,
        itinerary,
        routeAssignments,
        routes: itinerary.map((item) => item.description.trim()).filter(Boolean),
      }
    })
  }

  const moveVoucherItineraryItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setVoucherForm((current) => {
      const itinerary = [...(current.itinerary || [])]
      const fallbackVehicle = current.vehicleType || current.vehicle || ''
      const routeAssignments = itinerary.map((item, index) =>
        current.routeAssignments?.[index]
          ? { ...current.routeAssignments[index] }
          : {
              routeName: item.description,
              type: item.type,
              supplierName: '',
              vehicleType: fallbackVehicle,
              date: item.date,
              time: item.time,
            },
      )
      const [movedItinerary] = itinerary.splice(fromIndex, 1)
      const [movedAssignment] = routeAssignments.splice(fromIndex, 1)
      if (!movedItinerary || !movedAssignment) return current
      itinerary.splice(toIndex, 0, movedItinerary)
      routeAssignments.splice(toIndex, 0, movedAssignment)
      return {
        ...current,
        itinerary,
        routeAssignments,
        routes: itinerary.map((item) => item.description.trim()).filter(Boolean),
      }
    })
  }

  const resetVoucherFromFinalQuote = () => {
    const defaultVoucher = createDefaultTransportVoucherData(packageFolder)
    setEditingVoucherId(null)
    setVoucherForm(defaultVoucher)
    setVoucherRoutesText(defaultVoucher.routes.join('\n'))
    toast.success('New voucher started from final quote')
  }

  const editVoucher = (voucher: TravelPackageTransportVoucher) => {
    const normalizedVoucherData = normalizeVoucherVehicleFields(voucher.voucher_data)
    setEditingVoucherId(voucher.id)
    setVoucherForm(normalizedVoucherData)
    setVoucherRoutesText(
      (
        normalizedVoucherData.routes ||
        normalizedVoucherData.itinerary?.map((item) => item.description) ||
        []
      ).join('\n'),
    )
  }

  const rebuildVoucherItineraryFromAssignments = () => {
    setVoucherForm((current) => {
      const assignments = current.routeAssignments || []
      if (assignments.length === 0) return current
      return {
        ...current,
        routes: assignments.map((route) => route.routeName).filter(Boolean),
        itinerary: assignments.map((route) => ({
          type: route.type || 'Transport Segment',
          description: route.routeName,
          date: route.date || '',
          time: route.time || '',
        })),
      }
    })
  }

  const openVoucherPreview = (voucher?: TravelPackageTransportVoucher) => {
    const savedVoucher = voucher || selectedVoucher
    if (savedVoucher) {
      window.open(
        `/api/travel-packages/${encodeURIComponent(packageFolder.id)}/transport-vouchers/${encodeURIComponent(savedVoucher.id)}/preview`,
        '_blank',
        'noopener,noreferrer',
      )
      return
    }

    const htmlWithBase = voucherPreviewHtml.replace(
      /<head>/i,
      `<head><base href="${window.location.origin}/">`,
    )
    const blob = new Blob([htmlWithBase], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const buildVoucherData = () => {
    const itinerary = (voucherForm.itinerary || []).filter(
      (item) => item.type || item.description || item.date || item.time,
    )
    const routeAssignments = itinerary.map((item, index) => {
      const existing = voucherForm.routeAssignments?.[index]
      const fallbackVehicle = voucherForm.vehicleType || voucherForm.vehicle || ''
      return {
        routeName: item.description.trim() || existing?.routeName || '',
        type: item.type.trim() || existing?.type || 'Transport Segment',
        supplierName: existing?.supplierName || '',
        vehicleType: cleanTransportVoucherVehicleLabel(existing?.vehicleType, fallbackVehicle),
        date: item.date || existing?.date || '',
        time: item.time || existing?.time || '',
      }
    })
    return {
      ...voucherForm,
      passengers: formatVoucherPassengers(
        Number(voucherForm.adults || 0),
        Number(voucherForm.children || 0),
        Number(voucherForm.infants || 0),
      ),
      vehicleType: voucherForm.vehicleType || voucherForm.vehicle || '',
      transportCompany: voucherForm.transportCompany || voucherForm.providerName || '',
      groundManager: voucherForm.groundManager || voucherForm.providerContact || '',
      arrivalAt:
        voucherForm.arrivalAt ||
        (voucherForm.landingDate && voucherForm.landingTime
          ? `${voucherForm.landingDate}T${voucherForm.landingTime}`
          : ''),
      routes: itinerary.length
        ? itinerary.map((item) => item.description.trim()).filter(Boolean)
        : voucherRoutesText
            .split('\n')
            .map((route) => route.trim())
            .filter(Boolean),
      itinerary,
      routeAssignments,
    }
  }

  const saveVoucherEdits = async () => {
    if (!editingVoucherId) return
    setSaving('voucher')
    try {
      const voucherData = buildVoucherData()
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/transport-vouchers/${editingVoucherId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voucherData,
            customerVisible: selectedVoucher?.customer_visible || false,
          }),
        },
      )
      const data = await readApiResponse<{
        voucher?: TravelPackageTransportVoucher
        storageWarning?: string | null
        renderWarning?: string | null
        error?: string
      }>(response)
      if (!response.ok || !data.voucher) throw new Error(data.error || 'Failed to save voucher')
      setVouchers((current) =>
        current.map((voucher) => (voucher.id === data.voucher!.id ? data.voucher! : voucher)),
      )
      setVoucherForm(data.voucher.voucher_data)
      setVoucherRoutesText(
        (
          data.voucher.voucher_data.routes ||
          data.voucher.voucher_data.itinerary?.map((item) => item.description) ||
          []
        ).join('\n'),
      )
      toast.success('Voucher edits saved')
      if (data.renderWarning) toast.warning(data.renderWarning)
      if (data.storageWarning)
        toast.warning(`Voucher saved, but document storage failed: ${data.storageWarning}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save voucher')
    } finally {
      setSaving(null)
    }
  }

  const setVoucherVisibility = async (
    voucher: TravelPackageTransportVoucher,
    customerVisible: boolean,
  ) => {
    setSaving('voucher')
    try {
      const response = await fetch(
        `/api/travel-packages/${packageFolder.id}/transport-vouchers/${voucher.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerVisible }),
        },
      )
      const data = await readApiResponse<{
        voucher?: TravelPackageTransportVoucher
        storageWarning?: string | null
        renderWarning?: string | null
        error?: string
      }>(response)
      if (!response.ok || !data.voucher) {
        throw new Error(data.error || 'Failed to update voucher release status')
      }
      setVouchers((current) =>
        current.map((item) => {
          if (item.id === data.voucher!.id) return data.voucher!
          if (customerVisible && item.customer_visible) {
            return { ...item, customer_visible: false, status: 'amended' as const }
          }
          return item
        }),
      )
      if (editingVoucherId === data.voucher.id) setVoucherForm(data.voucher.voucher_data)
      toast.success(customerVisible ? 'Voucher released to customer' : 'Voucher revoked')
      if (data.renderWarning) toast.warning(data.renderWarning)
      if (data.storageWarning)
        toast.warning(`Voucher saved, but document storage failed: ${data.storageWarning}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update voucher')
    } finally {
      setSaving(null)
    }
  }

  const generateVoucher = async (customerVisible: boolean) => {
    setSaving('voucher')
    try {
      const voucherData = buildVoucherData()
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/transport-vouchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherData, customerVisible }),
      })
      const data = await readApiResponse<{
        voucher?: TravelPackageTransportVoucher
        storageWarning?: string | null
        renderWarning?: string | null
        error?: string
      }>(response)
      if (!response.ok || !data.voucher) throw new Error(data.error || 'Failed to generate voucher')
      setVouchers((current) => [
        data.voucher!,
        ...current.map((voucher) =>
          customerVisible && voucher.customer_visible
            ? { ...voucher, customer_visible: false, status: 'amended' as const }
            : voucher,
        ),
      ])
      setEditingVoucherId(data.voucher.id)
      setVoucherForm(data.voucher.voucher_data)
      setVoucherRoutesText(
        (
          data.voucher.voucher_data.routes ||
          data.voucher.voucher_data.itinerary?.map((item) => item.description) ||
          []
        ).join('\n'),
      )
      toast.success(customerVisible ? 'Voucher generated and released' : 'Voucher draft generated')
      if (data.renderWarning) toast.warning(data.renderWarning)
      if (data.storageWarning)
        toast.warning(`Voucher saved, but document storage failed: ${data.storageWarning}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate voucher')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section id="package-operations" className="border border-slate-200 bg-white shadow-sm">
      {dialog}
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-[#8b1e2d]">Operational workspace</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Package control</h2>
          </div>
          <button
            onClick={() => void syncWorkflow()}
            disabled={saving === 'sync'}
            className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving === 'sync' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileClock className="h-4 w-4" />
            )}
            Recalculate workflow
          </button>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-black ${activeTab === tab.value ? 'border-[#8b1e2d] text-[#8b1e2d]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm font-bold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading operations
        </div>
      ) : setupMessage ? (
        <div className="m-5 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {setupMessage}
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          {activeTab === 'control' && (
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
                <div className="border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-black text-slate-950">Package details</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Status, dates, and customer contact information.
                    </p>
                  </div>
                  <div className="space-y-4 p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="block text-xs font-bold text-slate-600">
                        Lifecycle status
                        <select
                          value={packageFolder.status}
                          onChange={(event) =>
                            void changePackageStatus(
                              event.target.value as TravelPackageFolderStatus,
                            )
                          }
                          className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          {availableStatuses.map((status) => (
                            <option key={status} value={status}>
                              {packageStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-bold text-slate-600">
                        Passport status
                        <select
                          value={packageFolder.passport_status}
                          onChange={(event) =>
                            void patchPackage({ passportStatus: event.target.value })
                          }
                          className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          {PASSPORT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {label(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">Next action</p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {packageFolder.next_action || 'Review package'}
                        </p>
                        {packageFolder.next_action_due_at && (
                          <p className="mt-1 text-xs text-slate-500">
                            Due {formatDateTime(packageFolder.next_action_due_at)}
                          </p>
                        )}
                      </div>
                    </div>

                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        void patchPackage(customerForm)
                      }}
                      className="grid gap-3 md:grid-cols-3"
                    >
                      <label className="text-xs font-bold text-slate-600">
                        Lead customer
                        <input
                          value={customerForm.customerName}
                          onChange={(event) =>
                            setCustomerForm((current) => ({
                              ...current,
                              customerName: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Phone
                        <input
                          value={customerForm.customerPhone}
                          onChange={(event) =>
                            setCustomerForm((current) => ({
                              ...current,
                              customerPhone: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Email
                        <input
                          type="email"
                          value={customerForm.customerEmail}
                          onChange={(event) =>
                            setCustomerForm((current) => ({
                              ...current,
                              customerEmail: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Destination
                        <input
                          value={customerForm.destination}
                          onChange={(event) =>
                            setCustomerForm((current) => ({
                              ...current,
                              destination: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Departure
                        <input
                          type="date"
                          value={customerForm.departureDate}
                          onChange={(event) =>
                            setCustomerForm((current) => ({
                              ...current,
                              departureDate: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Return
                        <input
                          type="date"
                          value={customerForm.returnDate}
                          onChange={(event) =>
                            setCustomerForm((current) => ({
                              ...current,
                              returnDate: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={saving === 'package'}
                        className="inline-flex items-center justify-center gap-2 bg-slate-900 px-3 py-2 text-xs font-black text-white md:col-span-3 md:justify-self-start disabled:opacity-50"
                      >
                        {saving === 'package' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save package details
                      </button>
                    </form>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="overflow-hidden border border-cyan-200 bg-white">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-100 bg-cyan-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-black text-cyan-950">Responsible agents</p>
                        <p className="mt-1 text-xs font-semibold text-cyan-800">
                          Employee ownership and the office branch responsible for this package.
                        </p>
                      </div>
                      {saving === 'package' && (
                        <span className="inline-flex items-center gap-2 text-xs font-black text-cyan-900">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving
                        </span>
                      )}
                    </div>
                    <div className="border-b border-cyan-100 bg-white px-3 py-3">
                      <label className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
                        <span>
                          Responsible office branch
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                            Office that owns this package
                          </span>
                        </span>
                        <select
                          value={packageFolder.location_id || ''}
                          onChange={(event) =>
                            void patchPackage({ locationId: event.target.value })
                          }
                          disabled={saving === 'package' || locations.length === 0}
                          className="w-full border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="">
                            {locations.length === 0 ? 'No branches available' : 'Choose a branch'}
                          </option>
                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                              {location.branch_code ? ` (${location.branch_code})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!packageLocation && suggestedLocation && (
                        <p className="mt-2 text-xs font-semibold text-cyan-800">
                          Suggested from {salesEmployee?.full_name || 'the sales owner'}:{' '}
                          {suggestedLocation.name}
                          {suggestedLocation.branch_code
                            ? ` (${suggestedLocation.branch_code})`
                            : ''}
                        </p>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Role</th>
                            <th className="px-3 py-2">Employee</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {responsibilityFields.map((field) => (
                            <tr key={field.bodyKey}>
                              <td className="w-24 px-3 py-2 align-top">
                                <p className="font-black text-slate-950">{field.label}</p>
                                <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">
                                  {field.helper}
                                </p>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <select
                                  value={field.value}
                                  onChange={(event) =>
                                    void patchPackage({ [field.bodyKey]: event.target.value })
                                  }
                                  disabled={saving === 'package' || employees.length === 0}
                                  className="w-full min-w-44 border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  <option value="">
                                    {employees.length === 0
                                      ? 'No employees available'
                                      : 'Not assigned'}
                                  </option>
                                  {employees.map((employee) => (
                                    <option key={employee.id} value={employee.id}>
                                      {employeeLabel(employee)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Open tasks</p>
                      <p className="mt-1 text-2xl font-black">{openTasks.length}</p>
                    </div>
                    <div className="border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Open risks</p>
                      <p className="mt-1 text-2xl font-black">{openRisks.length}</p>
                    </div>
                    <div className="border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">Risk level</p>
                      <p className="mt-1 text-lg font-black text-[#8b1e2d]">
                        {label(packageFolder.risk_level)}
                      </p>
                    </div>
                  </div>

                  <div
                    data-testid="package-commission-readiness"
                    className={`border p-4 ${commissionReadinessDisplay?.style || 'border-slate-200 bg-slate-50 text-slate-950'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 bg-white/80 p-2">
                          {commissionReadiness?.handoffReady ? (
                            <ShieldCheck className="h-5 w-5" />
                          ) : (
                            <AlertTriangle className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black">
                            {commissionReadinessDisplay?.title || 'Commission handoff'}
                          </p>
                          <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
                            {commissionReadinessLoading && !commissionReadiness
                              ? 'Checking the package source records.'
                              : commissionReadinessDisplay?.detail ||
                                commissionReadinessError ||
                                'Commission readiness is unavailable.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadCommissionReadiness()}
                        disabled={commissionReadinessLoading}
                        aria-label="Refresh Commission readiness"
                        className="border border-current/20 bg-white/70 p-2 disabled:opacity-50"
                      >
                        {commissionReadinessLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {commissionReadiness && (
                      <>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                          <div className="bg-white/70 p-2">
                            <p className="text-[10px] font-bold uppercase opacity-70">Passengers</p>
                            <p className="mt-1 text-lg font-black">
                              {commissionReadiness.passengerCount}
                            </p>
                          </div>
                          <div className="bg-white/70 p-2">
                            <p className="text-[10px] font-bold uppercase opacity-70">
                              Source rows
                            </p>
                            <p className="mt-1 text-lg font-black">
                              {commissionReadiness.calculationRowCount}
                            </p>
                          </div>
                          <div className="bg-white/70 p-2">
                            <p className="text-[10px] font-bold uppercase opacity-70">References</p>
                            <p className="mt-1 text-lg font-black">
                              {commissionReadiness.invoiceReferenceRowCount}
                            </p>
                          </div>
                          <div className="bg-white/70 p-2">
                            <p className="text-[10px] font-bold uppercase opacity-70">
                              Projected margin
                            </p>
                            <p className="mt-1 text-sm font-black">
                              {formatMoney(calculationTotals.projectedMargin, packageCurrency)}
                            </p>
                          </div>
                        </div>

                        {commissionReadiness.issues.length > 0 && (
                          <ul className="mt-4 space-y-2 text-xs font-semibold leading-5">
                            {commissionReadiness.issues.map((issue) => (
                              <li key={issue} className="flex gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                  {issue === 'missing_package_location'
                                    ? suggestedLocation
                                      ? `Choose the package branch. The sales owner belongs to ${suggestedLocation.name}${suggestedLocation.branch_code ? ` (${suggestedLocation.branch_code})` : ''}.`
                                      : 'Choose the office branch responsible for this package in the Responsible agents section above.'
                                    : getPackageCommissionIssueLabel(issue)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <button
                          type="button"
                          onClick={() => void autoResolveCommissionHandoff()}
                          disabled={saving === 'commission-handoff'}
                          className="mt-4 inline-flex items-center gap-2 border border-current/30 bg-white px-3 py-2 text-xs font-black disabled:opacity-50"
                        >
                          {saving === 'commission-handoff' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          {commissionReadiness.issues.length > 0
                            ? 'Resolve safe fixes automatically'
                            : 'Refresh safe reconciliation'}
                        </button>

                        {commissionEventError && (
                          <p className="mt-4 border border-current/20 bg-white/70 p-2 text-xs font-bold leading-5">
                            {commissionEventError}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-current/15 pt-3 text-[11px] font-bold opacity-75">
                          <span>Preview until Admin payroll approval</span>
                          {commissionReadiness.eventVersion && (
                            <span>Source version {commissionReadiness.eventVersion}</span>
                          )}
                        </div>
                      </>
                    )}

                    {commissionReadinessError && commissionReadiness && (
                      <p className="mt-3 text-xs font-semibold opacity-75">
                        Last refresh failed: {commissionReadinessError}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {openRisks.length > 0 && (
                <div className="space-y-2">
                  {openRisks.map((risk) => (
                    <div
                      key={risk.id}
                      className="flex flex-wrap items-center gap-3 border border-amber-200 bg-amber-50 p-3"
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-900">{risk.title}</p>
                        <p className="text-xs text-slate-600">{risk.description}</p>
                      </div>
                      <span className="text-xs font-black uppercase text-amber-700">
                        {risk.severity}
                      </span>
                      <button
                        onClick={() =>
                          void updateOperation('risk', risk.id, {
                            status: 'resolved',
                            resolutionNote: 'Resolved by agent.',
                          })
                        }
                        className="border border-amber-300 bg-white px-2 py-1 text-xs font-black text-amber-800"
                      >
                        Resolve
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'passengers' && (
            <div className="space-y-4">
              <PackagePassengerCreatePanel
                isOpen={showAddPassengerForm}
                onToggle={() => setShowAddPassengerForm((current) => !current)}
                groupFamilies={groupFamilies}
                selectedFamilyQuoteId={selectedPassengerFamilyQuoteId}
                setSelectedFamilyQuoteId={setSelectedPassengerFamilyQuoteId}
                passengerForm={passengerForm}
                setPassengerForm={setPassengerForm}
                onAddPassenger={addPassenger}
              />
              <PackagePassengerTable
                passengers={passengers}
                groupFamilies={groupFamilies}
                editingPassengerId={editingPassengerId}
                passengerEditForm={passengerEditForm}
                setPassengerEditForm={setPassengerEditForm}
                saving={saving}
                onStartPassengerEdit={startPassengerEdit}
                onSavePassengerEdit={savePassengerEdit}
                onCancelPassengerEdit={() => setEditingPassengerId(null)}
                onUpdatePassenger={updatePassenger}
                onDeletePassenger={deletePassenger}
              />
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-5">
              {groupFamilies.length > 0 && (
                <div className="border-y-4 border-cyan-900 bg-cyan-50 p-4 sm:border-x">
                  <p className="text-xs font-black uppercase text-cyan-900">
                    Family payment ledger
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Payments remain inside this shared customer file but belong to one family
                    account. Select a family before recording or editing its money movements.
                  </p>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {groupFamilies.map((family) => (
                      <button
                        key={family.quoteId}
                        type="button"
                        onClick={() => setSelectedPaymentFamilyQuoteId(family.quoteId)}
                        className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-black transition ${
                          selectedPaymentFamilyQuoteId === family.quoteId
                            ? 'bg-cyan-900 text-white'
                            : 'border border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-100'
                        }`}
                      >
                        {family.familyLabel}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentFamilyQuoteId('all')}
                      className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-black transition ${
                        selectedPaymentFamilyQuoteId === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      All families
                    </button>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Full amount</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(paymentTotalDue, paymentCurrency)}
                  </p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Net received</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(paymentSummary.netPaid, paymentCurrency)}
                  </p>
                  {paymentSummary.accountCredits > 0 && (
                    <p className="mt-1 text-xs font-bold text-sky-700">
                      Includes {formatMoney(paymentSummary.accountCredits, paymentSummary.currency)}{' '}
                      prior credit
                    </p>
                  )}
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Pending to pay</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(paymentSummary.pending, paymentCurrency)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Requested but not received
                  </p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Refunds</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(paymentSummary.refunds, paymentCurrency)}
                  </p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Reservation discounts
                  </p>
                  <p className="mt-1 text-lg font-black text-emerald-700">
                    {formatMoney(reservationDiscountTotal, paymentCurrency)}
                  </p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Outstanding balance</p>
                  <p className="mt-1 text-lg font-black text-[#8b1e2d]">
                    {formatMoney(paymentBalance, paymentCurrency)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Still to request: {formatMoney(unrequestedPaymentBalance, paymentCurrency)}
                  </p>
                </div>
              </div>
              <PackagePaymentEntryForm
                paymentForm={paymentForm}
                setPaymentForm={setPaymentForm}
                paymentPlan={paymentPlan}
                familySelectionRequired={groupFamilies.length > 0}
                familySelected={Boolean(selectedPaymentFamily)}
                saving={saving === 'payment'}
                onRecordPayment={addPayment}
              />
              {(groupFamilies.length === 0 || selectedPaymentFamily) && (
                <section className="flex flex-col gap-3 border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <BadgePercent className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" />
                    <div>
                      <h3 className="text-sm font-black text-emerald-950">
                        Discounts come from Reservations
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">
                        Edit the reservation financials to change the amount due. Payments, profit,
                        and Commission all use those values; an optional customer invoice does not
                        change them.
                      </p>
                    </div>
                  </div>
                  {onOpenReservations && (
                    <button
                      type="button"
                      onClick={onOpenReservations}
                      className="inline-flex shrink-0 items-center justify-center gap-2 bg-emerald-800 px-4 py-2 text-xs font-black text-white"
                    >
                      <Pencil className="h-4 w-4" />
                      Open Reservations
                    </button>
                  )}
                </section>
              )}
              <PackagePaymentTable
                payments={visiblePayments}
                groupFamilies={groupFamilies}
                editingPaymentId={editingPaymentId}
                paymentEditForm={paymentEditForm}
                setPaymentEditForm={setPaymentEditForm}
                saving={saving}
                onStartPaymentEdit={startPaymentEdit}
                onSavePaymentEdit={savePaymentEdit}
                onCancelPaymentEdit={() => setEditingPaymentId(null)}
                onUpdatePaymentStatus={updatePaymentStatus}
                onDeletePayment={deletePayment}
              />
              <PackageInstallmentPlanPanel
                paymentPlan={paymentPlan}
                planForm={planForm}
                setPlanForm={setPlanForm}
                onCreatePlan={createPaymentPlan}
              />
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="grid gap-5 xl:grid-cols-2">
              <PackageTasksPanel
                tasks={tasks}
                taskForm={taskForm}
                setTaskForm={setTaskForm}
                onCreateTask={(body) => createOperation('task', body)}
                onUpdateTask={(taskId, body) => updateOperation('task', taskId, body)}
              />
              <PackageDeadlinesPanel
                deadlines={deadlines}
                deadlineForm={deadlineForm}
                setDeadlineForm={setDeadlineForm}
                onCreateDeadline={(body) => createOperation('deadline', body)}
                onMarkDeadlineMet={(deadlineId) =>
                  updateOperation('deadline', deadlineId, { status: 'met' })
                }
              />
              <PackageCommunicationPanel
                communications={communications}
                communicationForm={communicationForm}
                setCommunicationForm={setCommunicationForm}
                onLogCommunication={(body) => createOperation('communication', body)}
              />
            </div>
          )}

          {activeTab === 'voucher' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-sm font-black text-slate-900">Dynamic Transport Voucher</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Final quote details are prefilled. Complete flight, landing, transport provider,
                    driver, and route timings before releasing.
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    {selectedVoucher
                      ? `Editing voucher v${selectedVoucher.version}`
                      : 'Creating a new voucher from the final quote'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetVoucherFromFinalQuote}
                  className="border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"
                >
                  New voucher from final quote
                </button>
              </div>

              {voucherRouteAssignments.length > 0 && (
                <div className="border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-emerald-900">
                        Route data from final quote
                      </p>
                      <p className="mt-1 text-xs font-semibold text-emerald-800">
                        Vehicle details are shown per route. Route pricing supplier and cost details
                        stay internal for operations.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={rebuildVoucherItineraryFromAssignments}
                      className="border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-900"
                    >
                      Rebuild itinerary rows
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {voucherRouteAssignments.map((route, index) => (
                      <div key={`${route.routeName}-${index}`} className="bg-white p-3 text-xs">
                        <p className="font-black text-slate-900">
                          {index + 1}. {route.routeName || 'Route to confirm'}
                        </p>
                        <p className="mt-1 font-semibold text-slate-500">
                          {route.type || 'Transport Segment'}
                          {route.vehicleType ? ` · ${route.vehicleType}` : ''}
                          {route.supplierName ? ` · ${route.supplierName}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] 2xl:grid-cols-[minmax(0,1fr)_34rem]">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-bold text-slate-600">
                      Vehicle type
                      <select
                        value={voucherForm.vehicle || voucherForm.vehicleType || 'H1'}
                        onChange={(event) => {
                          const vehicle = getVehicleCapacity(event.target.value)
                          updateVoucherField('vehicle', event.target.value)
                          updateVoucherField('vehicleType', event.target.value)
                          if (vehicle) updateVoucherField('maxBags', String(vehicle.bags))
                        }}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      >
                        {TRANSPORT_VEHICLES.map((vehicle) => (
                          <option key={vehicle.name} value={vehicle.name}>
                            {vehicle.name} ({vehicle.passengers} pax, {vehicle.bags} bags)
                          </option>
                        ))}
                        {voucherForm.vehicle &&
                          !TRANSPORT_VEHICLES.some((item) => item.name === voucherForm.vehicle) && (
                            <option value={voucherForm.vehicle}>{voucherForm.vehicle}</option>
                          )}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Max bags
                      <input
                        value={voucherForm.maxBags || ''}
                        onChange={(event) => updateVoucherField('maxBags', event.target.value)}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Extra baggage fee
                      <input
                        value={voucherForm.extraBaggageFee || ''}
                        onChange={(event) =>
                          updateVoucherField('extraBaggageFee', event.target.value)
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-3">
                    <label className="text-xs font-bold text-slate-600">
                      Adults
                      <input
                        type="number"
                        min="0"
                        value={voucherForm.adults || 0}
                        onChange={(event) =>
                          updateVoucherField('adults', Number(event.target.value))
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Children
                      <input
                        type="number"
                        min="0"
                        value={voucherForm.children || 0}
                        onChange={(event) =>
                          updateVoucherField('children', Number(event.target.value))
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Infants
                      <input
                        type="number"
                        min="0"
                        value={voucherForm.infants || 0}
                        onChange={(event) =>
                          updateVoucherField('infants', Number(event.target.value))
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    {voucherPassengerError && (
                      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 md:col-span-3">
                        {voucherPassengerError}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Booking ID
                      <input
                        value={voucherForm.bookingId || ''}
                        onChange={(event) => updateVoucherField('bookingId', event.target.value)}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Flight number
                      <input
                        value={voucherForm.flightNumber || ''}
                        onChange={(event) => updateVoucherField('flightNumber', event.target.value)}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Airports
                      <input
                        value={voucherForm.airports || ''}
                        onChange={(event) => updateVoucherField('airports', event.target.value)}
                        placeholder="LHR to JED"
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-600">
                        Landing date
                        <input
                          type="date"
                          value={voucherForm.landingDate || ''}
                          onChange={(event) =>
                            updateVoucherField('landingDate', event.target.value)
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Landing time
                        <input
                          type="time"
                          value={voucherForm.landingTime || ''}
                          onChange={(event) =>
                            updateVoucherField('landingTime', event.target.value)
                          }
                          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <label className="text-xs font-bold text-slate-600">
                      Transport provider name
                      <input
                        value={voucherForm.providerName || voucherForm.transportCompany || ''}
                        onChange={(event) => {
                          updateVoucherField('providerName', event.target.value)
                          updateVoucherField('transportCompany', event.target.value)
                        }}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Transport provider contact
                      <input
                        value={voucherForm.providerContact || voucherForm.groundManager || ''}
                        onChange={(event) => {
                          updateVoucherField('providerContact', event.target.value)
                          updateVoucherField('groundManager', event.target.value)
                        }}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Makkah hotel
                      <input
                        value={voucherForm.makkahHotel}
                        onChange={(event) => updateVoucherField('makkahHotel', event.target.value)}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Madinah hotel
                      <input
                        value={voucherForm.madinahHotel}
                        onChange={(event) => updateVoucherField('madinahHotel', event.target.value)}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Driver contact
                      <input
                        value={voucherForm.driverContact}
                        onChange={(event) =>
                          updateVoucherField('driverContact', event.target.value)
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Departure date/time
                      <input
                        type="datetime-local"
                        value={dateTimeInput(voucherForm.departureAt)}
                        onChange={(event) => updateVoucherField('departureAt', event.target.value)}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Customer note
                      <textarea
                        value={voucherForm.publicNotes}
                        onChange={(event) => updateVoucherField('publicNotes', event.target.value)}
                        rows={3}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Internal note
                      <textarea
                        value={voucherForm.internalNotes}
                        onChange={(event) =>
                          updateVoucherField('internalNotes', event.target.value)
                        }
                        rows={3}
                        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-col border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-black text-slate-900">Itinerary Builder</h3>
                  <div className="mt-3 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                    {(voucherForm.itinerary || []).map((item, index) => (
                      <div
                        key={index}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggedVoucherSegmentIndex !== null) {
                            moveVoucherItineraryItem(draggedVoucherSegmentIndex, index)
                          }
                          setDraggedVoucherSegmentIndex(null)
                        }}
                        className={`space-y-2 border bg-white p-3 transition ${
                          draggedVoucherSegmentIndex === index
                            ? 'border-cyan-500 bg-cyan-50 opacity-70'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => {
                                setDraggedVoucherSegmentIndex(index)
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', String(index))
                              }}
                              onDragEnd={() => setDraggedVoucherSegmentIndex(null)}
                              className="inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center border border-slate-200 bg-slate-50 text-slate-500 active:cursor-grabbing"
                              title="Drag to reorder segment"
                              aria-label={`Reorder segment ${index + 1}`}
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <p className="truncate text-xs font-black text-slate-700">
                              Segment #{index + 1}: {item.type || 'Transport Segment'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeVoucherItineraryItem(index)}
                            className="text-xs font-black text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[11px] font-bold uppercase text-slate-500">
                            Segment type
                            <input
                              value={item.type}
                              onChange={(event) =>
                                updateVoucherItinerary(index, { type: event.target.value })
                              }
                              placeholder="Airport Pickup"
                              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
                            />
                          </label>
                          <label className="text-[11px] font-bold uppercase text-slate-500">
                            Vehicle for this segment
                            <select
                              value={
                                voucherForm.routeAssignments?.[index]?.vehicleType ||
                                voucherForm.vehicleType ||
                                voucherForm.vehicle ||
                                ''
                              }
                              onChange={(event) =>
                                updateVoucherItineraryVehicle(index, event.target.value)
                              }
                              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
                            >
                              <option value="">To be confirmed</option>
                              {TRANSPORT_VEHICLES.map((vehicle) => (
                                <option key={vehicle.name} value={vehicle.name}>
                                  {vehicle.name}
                                </option>
                              ))}
                              {voucherForm.routeAssignments?.[index]?.vehicleType &&
                                !TRANSPORT_VEHICLES.some(
                                  (vehicle) =>
                                    vehicle.name ===
                                    voucherForm.routeAssignments?.[index]?.vehicleType,
                                ) && (
                                  <option
                                    value={voucherForm.routeAssignments[index]?.vehicleType || ''}
                                  >
                                    {voucherForm.routeAssignments[index]?.vehicleType}
                                  </option>
                                )}
                            </select>
                          </label>
                        </div>
                        <input
                          value={item.description}
                          onChange={(event) =>
                            updateVoucherItinerary(index, { description: event.target.value })
                          }
                          placeholder="JED Airport to Makkah Hotel"
                          className="w-full border border-slate-300 px-3 py-2 text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={item.date}
                            onChange={(event) =>
                              updateVoucherItinerary(index, { date: event.target.value })
                            }
                            className="border border-slate-300 px-3 py-2 text-sm"
                          />
                          <input
                            type="time"
                            value={item.time}
                            onChange={(event) =>
                              updateVoucherItinerary(index, { time: event.target.value })
                            }
                            className="border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    ))}
                    {(voucherForm.itinerary || []).length === 0 && (
                      <p className="border border-dashed border-slate-300 bg-white p-4 text-center text-sm font-bold text-slate-500">
                        No itinerary segments yet.
                      </p>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={() => addVoucherItineraryItem("Ziyara'at / Tour")}
                      className="bg-blue-100 p-2 text-xs font-black text-blue-800"
                    >
                      Add Ziyara&apos;at
                    </button>
                    <button
                      type="button"
                      onClick={() => addVoucherItineraryItem('Hotel Transfer')}
                      className="bg-emerald-100 p-2 text-xs font-black text-emerald-800"
                    >
                      Add Hotel Transfer
                    </button>
                    <button
                      type="button"
                      onClick={() => addVoucherItineraryItem('Return Transfer')}
                      className="col-span-2 bg-slate-200 p-2 text-xs font-black text-slate-800"
                    >
                      Add Return to Airport
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {editingVoucherId && (
                  <button
                    type="button"
                    onClick={() => void saveVoucherEdits()}
                    disabled={saving === 'voucher' || Boolean(voucherPassengerError)}
                    className="inline-flex items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"
                  >
                    <Check className="h-4 w-4" />
                    Save edits to selected voucher
                  </button>
                )}
                <button
                  onClick={() => void generateVoucher(false)}
                  disabled={saving === 'voucher' || Boolean(voucherPassengerError)}
                  className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-black"
                >
                  <Save className="h-4 w-4" />
                  Generate new internal voucher
                </button>
                <button
                  onClick={() => void generateVoucher(true)}
                  disabled={saving === 'voucher' || Boolean(voucherPassengerError)}
                  className="inline-flex items-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Generate new and release
                </button>
              </div>
              <div className="border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-slate-900">Voucher preview</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-500">
                      {selectedVoucher ? `v${selectedVoucher.version}` : 'Unsaved preview'}
                    </p>
                    <button
                      type="button"
                      onClick={() => openVoucherPreview()}
                      className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View / Print
                    </button>
                  </div>
                </div>
                <iframe
                  title="Transport voucher preview"
                  srcDoc={voucherPreviewHtml}
                  className="h-[34rem] w-full border border-slate-200 bg-white"
                />
              </div>
              {vouchers.length > 0 && (
                <div className="overflow-x-auto border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Version</th>
                        <th className="px-3 py-2">Generated</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {vouchers.map((voucher) => (
                        <tr
                          key={voucher.id}
                          className={voucher.id === editingVoucherId ? 'bg-red-50/50' : ''}
                        >
                          <td className="px-3 py-2 font-black">v{voucher.version}</td>
                          <td className="px-3 py-2">{formatDateTime(voucher.generated_at)}</td>
                          <td className="px-3 py-2">{label(voucher.status)}</td>
                          <td className="px-3 py-2">
                            {voucher.customer_visible ? 'Released' : 'Internal'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => editVoucher(voucher)}
                                className="border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
                              >
                                Edit / Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => openVoucherPreview(voucher)}
                                className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-800"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View / Print
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void setVoucherVisibility(voucher, !voucher.customer_visible)
                                }
                                disabled={saving === 'voucher'}
                                className={`px-2 py-1 text-xs font-black ${
                                  voucher.customer_visible
                                    ? 'border border-red-200 bg-red-50 text-red-700'
                                    : 'bg-[#8b1e2d] text-white'
                                }`}
                              >
                                {voucher.customer_visible ? 'Revoke' : 'Release'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {auditEvents.map((event) => (
                <article key={event.id} className="flex gap-3 border-b border-slate-200 pb-3">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center bg-slate-100">
                    <History className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{event.event_summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {label(event.event_type)} · {formatDateTime(event.created_at)}
                    </p>
                  </div>
                </article>
              ))}
              {auditEvents.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">No audit events yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

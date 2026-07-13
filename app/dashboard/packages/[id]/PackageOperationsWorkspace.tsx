'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ClipboardList,
  CreditCard,
  FileClock,
  History,
  Loader2,
  MessageSquarePlus,
  Plus,
  ReceiptText,
  Route,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
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
  TravelPackageRiskFlag,
  TravelPackageTask,
  TravelPackageTransportVoucher,
  TravelPackageTransportVoucherData,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import {
  calculatePackagePaymentSummary,
  getTravelPackageStatusTransitions,
} from '@/lib/packageWorkflow'
import { createDefaultTransportVoucherData } from '@/lib/packageTransportVoucher'

type Props = {
  packageFolder: TravelPackageFolder
  invoice: TravelPackageInvoice | null
  onPackageChange: (packageFolder: TravelPackageFolder) => void
  onInvoiceChange?: (invoice: TravelPackageInvoice) => void
}

type WorkspaceTab = 'control' | 'passengers' | 'payments' | 'activity' | 'voucher' | 'history'

type OperationsResponse = {
  tasks?: TravelPackageTask[]
  deadlines?: TravelPackageDeadline[]
  risks?: TravelPackageRiskFlag[]
  communications?: TravelPackageCommunication[]
  auditEvents?: TravelPackageAuditEvent[]
  setupRequired?: boolean
  message?: string
  error?: string
}

const TABS: Array<{ value: WorkspaceTab; label: string; icon: typeof Users }> = [
  { value: 'control', label: 'Control', icon: ClipboardList },
  { value: 'passengers', label: 'Passengers', icon: Users },
  { value: 'payments', label: 'Payments', icon: CreditCard },
  { value: 'activity', label: 'Tasks & Notes', icon: MessageSquarePlus },
  { value: 'voucher', label: 'Transport Voucher', icon: Route },
  { value: 'history', label: 'Audit', icon: History },
]

const PASSPORT_STATUSES = [
  'not_requested',
  'requested',
  'received_whatsapp',
  'checked',
  'issues_found',
  'ready',
] as const

const PAYMENT_METHODS: Array<{ value: TravelPackagePaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

const PAYMENT_TYPES: Array<{ value: TravelPackagePaymentType; label: string }> = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'payment', label: 'Payment' },
  { value: 'refund', label: 'Refund' },
  { value: 'chargeback', label: 'Chargeback' },
  { value: 'commission', label: 'Commission' },
]

function dateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function dateTimeInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function emptyVoucher(): TravelPackageTransportVoucherData {
  return {
    bookingId: '',
    adults: 0,
    children: 0,
    infants: 0,
    passengers: '',
    flightNumber: '',
    airports: '',
    landingDate: '',
    landingTime: '',
    vehicle: 'H1',
    maxBags: '6',
    extraBaggageFee: '50 SAR per bag',
    providerName: 'Barakat AlMusafar Trading',
    providerContact: '+966555049005',
    itinerary: [],
    arrivalAirport: '',
    arrivalAt: '',
    departureAirport: '',
    departureAt: '',
    makkahHotel: '',
    madinahHotel: '',
    routes: [],
    vehicleType: '',
    transportCompany: '',
    driverContact: '',
    groundManager: '',
    publicNotes: '',
    internalNotes: '',
  }
}

const TRANSPORT_VEHICLES = [
  { name: 'Car', passengers: 4, bags: 3 },
  { name: 'H1', passengers: 6, bags: 6 },
  { name: 'Hiace', passengers: 13, bags: 13 },
  { name: 'Coaster', passengers: 18, bags: 18 },
  { name: 'Coach', passengers: 52, bags: 52 },
]

function getVehicleCapacity(vehicle: string | undefined) {
  return TRANSPORT_VEHICLES.find((item) => item.name === vehicle)
}

export default function PackageOperationsWorkspace({
  packageFolder,
  invoice,
  onPackageChange,
  onInvoiceChange,
}: Props) {
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

  const [customerForm, setCustomerForm] = useState({
    customerName: packageFolder.customer_name || '',
    customerPhone: packageFolder.customer_phone || '',
    customerEmail: packageFolder.customer_email || '',
    destination: packageFolder.destination || '',
    departureDate: dateInput(packageFolder.departure_date),
    returnDate: dateInput(packageFolder.return_date),
  })
  const [passengerForm, setPassengerForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    passengerType: 'adult' as TravelPackagePassengerType,
  })
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentType: 'deposit' as TravelPackagePaymentType,
    paymentMethod: 'bank_transfer' as TravelPackagePaymentMethod,
    paymentStatus: 'completed' as TravelPackagePaymentStatus,
    dueAt: '',
    installmentId: '',
    receiptReference: '',
    notes: '',
  })
  const [planForm, setPlanForm] = useState({
    totalAmount: '',
    depositAmount: '',
    installmentCount: '3',
    frequency: 'monthly',
    startsOn: dateInput(new Date().toISOString()),
    lmsPlanId: '',
    internalNotes: '',
  })
  const [taskForm, setTaskForm] = useState({ title: '', dueAt: '', priority: 'medium' })
  const [deadlineForm, setDeadlineForm] = useState({ title: '', dueAt: '', severity: 'medium' })
  const [communicationForm, setCommunicationForm] = useState({
    summary: '',
    channel: 'whatsapp',
    direction: 'outbound',
    followUpRequired: false,
    followUpDueAt: '',
  })
  const [voucherForm, setVoucherForm] = useState<TravelPackageTransportVoucherData>(emptyVoucher)
  const [voucherRoutesText, setVoucherRoutesText] = useState('')

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
          passengerResponse.json(),
          paymentResponse.json(),
          operationsResponse.json(),
          voucherResponse.json(),
          planResponse.json(),
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
      const failed = [
        passengerResponse,
        paymentResponse,
        operationsResponse,
        voucherResponse,
        planResponse,
      ].find((response) => !response.ok)
      if (failed) {
        const responseData = [passengerData, paymentData, operationData, voucherData, planData][
          [
            passengerResponse,
            paymentResponse,
            operationsResponse,
            voucherResponse,
            planResponse,
          ].indexOf(failed)
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
      setVouchers(voucherData.vouchers || [])
      setPaymentPlan(planData.plan || null)
      setSetupMessage(
        passengerData.setupRequired ||
          paymentData.setupRequired ||
          operationData.setupRequired ||
          voucherData.setupRequired
          ? passengerData.message ||
              paymentData.message ||
              operationData.message ||
              voucherData.message ||
              'Complete package workflow migration required.'
          : null,
      )
      const latestVoucher = voucherData.vouchers?.[0]
      if (latestVoucher) {
        setVoucherForm(latestVoucher.voucher_data)
        setVoucherRoutesText(
          (
            latestVoucher.voucher_data.routes ||
            latestVoucher.voucher_data.itinerary?.map((item) => item.description) ||
            []
          ).join('\n'),
        )
      } else {
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

  const paymentSummary = useMemo(() => calculatePackagePaymentSummary(payments), [payments])
  const openTasks = tasks.filter((task) => ['open', 'in_progress', 'blocked'].includes(task.status))
  const openRisks = risks.filter((risk) => risk.status !== 'resolved')
  const availableStatuses = [
    packageFolder.status,
    ...getTravelPackageStatusTransitions(packageFolder.status),
  ]
  const selectedVehicle = getVehicleCapacity(voucherForm.vehicle || voucherForm.vehicleType)
  const voucherSeatPassengers = Number(voucherForm.adults || 0) + Number(voucherForm.children || 0)
  const voucherPassengerError =
    selectedVehicle && voucherSeatPassengers > selectedVehicle.passengers
      ? `Exceeds capacity of ${selectedVehicle.passengers}. Select a larger vehicle.`
      : ''

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

  const changePackageStatus = async (status: TravelPackageFolderStatus) => {
    if (status === 'cancelled') {
      const reason = window.prompt('Enter the cancellation reason:')?.trim()
      if (!reason) return
      await patchPackage({ status, cancellationReason: reason })
      return
    }
    await patchPackage({ status })
  }

  const refreshInvoice = async () => {
    if (!onInvoiceChange) return
    const response = await fetch(`/api/travel-packages/${packageFolder.id}/invoice`)
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
        body: JSON.stringify(passengerForm),
      })
      const data = (await response.json()) as { passenger?: TravelPackagePassenger; error?: string }
      if (!response.ok || !data.passenger) throw new Error(data.error || 'Failed to add passenger')
      setPassengers((current) => [...current, data.passenger!])
      setPassengerForm({ firstName: '', lastName: '', dateOfBirth: '', passengerType: 'adult' })
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update passenger')
    } finally {
      setSaving(null)
    }
  }

  const deletePassenger = async (passenger: TravelPackagePassenger) => {
    if (!window.confirm('Delete this passenger record?')) return
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
    setSaving('payment')
    try {
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentForm,
          invoiceId: invoice?.id || null,
          currency: invoice?.currency || 'GBP',
        }),
      })
      const data = (await response.json()) as { payment?: TravelPackagePayment; error?: string }
      if (!response.ok || !data.payment) throw new Error(data.error || 'Failed to record payment')
      setPayments((current) => [data.payment!, ...current])
      await refreshInvoice()
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
      toast.success('Payment recorded and invoice balance updated')
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
      await refreshInvoice()
      await refreshPaymentPlan()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payment')
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
          invoiceId: invoice?.id || null,
          currency: invoice?.currency || 'GBP',
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
      return {
        ...current,
        itinerary,
        routes: itinerary.map((item) => item.description.trim()).filter(Boolean),
      }
    })
  }

  const addVoucherItineraryItem = (type: string) => {
    setVoucherForm((current) => ({
      ...current,
      itinerary: [...(current.itinerary || []), { type, description: '', date: '', time: '' }],
    }))
  }

  const removeVoucherItineraryItem = (index: number) => {
    setVoucherForm((current) => {
      const itinerary = (current.itinerary || []).filter((_, itemIndex) => itemIndex !== index)
      return {
        ...current,
        itinerary,
        routes: itinerary.map((item) => item.description.trim()).filter(Boolean),
      }
    })
  }

  const resetVoucherFromFinalQuote = () => {
    const defaultVoucher = createDefaultTransportVoucherData(packageFolder)
    setVoucherForm(defaultVoucher)
    setVoucherRoutesText(defaultVoucher.routes.join('\n'))
    toast.success('Voucher fields reset from final quote')
  }

  const generateVoucher = async (customerVisible: boolean) => {
    setSaving('voucher')
    try {
      const itinerary = (voucherForm.itinerary || []).filter(
        (item) => item.type || item.description || item.date || item.time,
      )
      const voucherData = {
        ...voucherForm,
        passengers:
          voucherForm.passengers ||
          `${voucherForm.adults || 0} Adults, ${voucherForm.children || 0} Children${
            voucherForm.infants ? `, ${voucherForm.infants} Infants` : ''
          }`,
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
      }
      const response = await fetch(`/api/travel-packages/${packageFolder.id}/transport-vouchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherData, customerVisible }),
      })
      const data = (await response.json()) as {
        voucher?: TravelPackageTransportVoucher
        error?: string
      }
      if (!response.ok || !data.voucher) throw new Error(data.error || 'Failed to generate voucher')
      setVouchers((current) => [data.voucher!, ...current])
      toast.success(customerVisible ? 'Voucher generated and released' : 'Voucher draft generated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate voucher')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section id="package-operations" className="border border-slate-200 bg-white shadow-sm">
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
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600">
                  Lifecycle status
                  <select
                    value={packageFolder.status}
                    onChange={(event) =>
                      void changePackageStatus(event.target.value as TravelPackageFolderStatus)
                    }
                    className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {label(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600">
                  Passport status
                  <select
                    value={packageFolder.passport_status}
                    onChange={(event) => void patchPackage({ passportStatus: event.target.value })}
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
              <div>
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
                    className="inline-flex items-center justify-center gap-2 bg-slate-900 px-3 py-2 text-xs font-black text-white md:col-span-3 md:justify-self-start"
                  >
                    <Save className="h-4 w-4" />
                    Save package details
                  </button>
                </form>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Open tasks</p>
                  <p className="mt-1 text-2xl font-black">{openTasks.length}</p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Open risks</p>
                  <p className="mt-1 text-2xl font-black">{openRisks.length}</p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Risk level</p>
                  <p className="mt-1 text-lg font-black text-[#8b1e2d]">
                    {label(packageFolder.risk_level)}
                  </p>
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
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void addPassenger()
                }}
                className="grid gap-3 border border-slate-200 bg-slate-50 p-4 md:grid-cols-5"
              >
                <label className="text-xs font-bold text-slate-600">
                  First name
                  <input
                    value={passengerForm.firstName}
                    onChange={(event) =>
                      setPassengerForm((current) => ({
                        ...current,
                        firstName: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Last name
                  <input
                    value={passengerForm.lastName}
                    onChange={(event) =>
                      setPassengerForm((current) => ({ ...current, lastName: event.target.value }))
                    }
                    className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Date of birth
                  <input
                    type="date"
                    value={passengerForm.dateOfBirth}
                    onChange={(event) =>
                      setPassengerForm((current) => ({
                        ...current,
                        dateOfBirth: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Passenger type
                  <select
                    value={passengerForm.passengerType}
                    onChange={(event) =>
                      setPassengerForm((current) => ({
                        ...current,
                        passengerType: event.target.value as TravelPackagePassengerType,
                      }))
                    }
                    className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="adult">Adult</option>
                    <option value="child">Child</option>
                    <option value="infant">Infant / under 5</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white"
                >
                  <UserPlus className="h-4 w-4" />
                  Add passenger
                </button>
              </form>
              <div className="overflow-x-auto border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Passenger</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Passport received</th>
                      <th className="px-3 py-2">Checked</th>
                      <th className="px-3 py-2">Visa</th>
                      <th className="px-3 py-2">Ticket</th>
                      <th className="w-12 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {passengers.map((passenger) => (
                      <tr key={passenger.id}>
                        <td className="px-3 py-2 font-bold">
                          {[passenger.first_name, passenger.last_name].filter(Boolean).join(' ') ||
                            'Name pending'}
                        </td>
                        <td className="px-3 py-2">{label(passenger.passenger_type)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={passenger.passport_received}
                            onChange={(event) =>
                              void updatePassenger(passenger, {
                                passportReceived: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={passenger.passport_checked}
                            onChange={(event) =>
                              void updatePassenger(passenger, {
                                passportChecked: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={passenger.visa_status}
                            onChange={(event) =>
                              void updatePassenger(passenger, { visaStatus: event.target.value })
                            }
                            className="border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="not_started">Not started</option>
                            <option value="details_required">Details required</option>
                            <option value="submitted">Submitted</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="not_required">Not required</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={passenger.ticket_status}
                            onChange={(event) =>
                              void updatePassenger(passenger, { ticketStatus: event.target.value })
                            }
                            className="border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="not_started">Not started</option>
                            <option value="held">Held</option>
                            <option value="ticketed">Ticketed</option>
                            <option value="changed">Changed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            title="Delete passenger"
                            onClick={() => void deletePassenger(passenger)}
                            className="p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {passengers.length === 0 && (
                  <p className="p-5 text-center text-sm text-slate-500">
                    No passenger records yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Net received</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(
                      paymentSummary.netPaid,
                      invoice?.currency || paymentSummary.currency,
                    )}
                  </p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Pending</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(
                      paymentSummary.pending,
                      invoice?.currency || paymentSummary.currency,
                    )}
                  </p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Refunds</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(
                      paymentSummary.refunds,
                      invoice?.currency || paymentSummary.currency,
                    )}
                  </p>
                </div>
                <div className="border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Invoice balance</p>
                  <p className="mt-1 text-lg font-black text-[#8b1e2d]">
                    {formatMoney(invoice?.balance_due || 0, invoice?.currency || 'GBP')}
                  </p>
                </div>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void addPayment()
                }}
                className="grid gap-3 border border-slate-200 bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-4"
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={paymentForm.amount}
                  onChange={(event) =>
                    setPaymentForm((current) => ({ ...current, amount: event.target.value }))
                  }
                  className="border border-slate-300 px-3 py-2 text-sm"
                  required
                />
                {paymentPlan?.installments?.some((installment) => installment.status !== 'paid') ? (
                  <select
                    value={paymentForm.installmentId}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        installmentId: event.target.value,
                      }))
                    }
                    className="border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">No installment link</option>
                    {paymentPlan.installments
                      ?.filter((installment) => installment.status !== 'paid')
                      .map((installment) => (
                        <option key={installment.id} value={installment.id}>
                          Installment #{installment.sequence_number} · {installment.due_on} ·{' '}
                          {formatMoney(installment.amount, paymentPlan.currency)}
                        </option>
                      ))}
                  </select>
                ) : null}
                <select
                  value={paymentForm.paymentType}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      paymentType: event.target.value as TravelPackagePaymentType,
                    }))
                  }
                  className="border border-slate-300 px-3 py-2 text-sm"
                >
                  {PAYMENT_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      paymentMethod: event.target.value as TravelPackagePaymentMethod,
                    }))
                  }
                  className="border border-slate-300 px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentForm.paymentStatus}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      paymentStatus: event.target.value as TravelPackagePaymentStatus,
                    }))
                  }
                  className="border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="completed">Received</option>
                  <option value="pending">Requested / pending</option>
                  <option value="failed">Failed</option>
                </select>
                <input
                  type="datetime-local"
                  title="Payment due"
                  value={paymentForm.dueAt}
                  onChange={(event) =>
                    setPaymentForm((current) => ({ ...current, dueAt: event.target.value }))
                  }
                  className="border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Receipt / bank reference"
                  value={paymentForm.receiptReference}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      receiptReference: event.target.value,
                    }))
                  }
                  className="border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Payment note"
                  value={paymentForm.notes}
                  onChange={(event) =>
                    setPaymentForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={saving === 'payment'}
                  className="inline-flex items-center justify-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white"
                >
                  <Plus className="h-4 w-4" />
                  Record payment
                </button>
              </form>
              <div className="overflow-x-auto border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {formatDateTime(payment.received_at || payment.created_at)}
                        </td>
                        <td className="px-3 py-2 font-bold">{label(payment.payment_type)}</td>
                        <td className="px-3 py-2">{label(payment.payment_method)}</td>
                        <td className="px-3 py-2">{payment.receipt_reference || '-'}</td>
                        <td className="px-3 py-2 text-right font-black">
                          {formatMoney(payment.amount, payment.currency)}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={payment.payment_status}
                            onChange={(event) =>
                              void updatePaymentStatus(
                                payment,
                                event.target.value as TravelPackagePaymentStatus,
                              )
                            }
                            className="border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="pending">Pending</option>
                            <option value="completed">Completed</option>
                            <option value="failed">Failed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="refunded">Refunded</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payments.length === 0 && (
                  <p className="p-5 text-center text-sm text-slate-500">No payments recorded.</p>
                )}
              </div>
              <div className="border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-[#8b1e2d]" />
                  <h3 className="text-sm font-black">Installment plan</h3>
                </div>
                {paymentPlan ? (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-slate-600">
                      {label(paymentPlan.frequency)} ·{' '}
                      {formatMoney(paymentPlan.total_amount, paymentPlan.currency)} ·{' '}
                      {paymentPlan.status}
                    </p>
                    {paymentPlan.lms_plan_id && (
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        LMS reference: {paymentPlan.lms_plan_id}
                      </p>
                    )}
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      {paymentPlan.installments?.map((installment) => (
                        <div key={installment.id} className="border border-slate-200 p-2 text-xs">
                          <div className="flex justify-between">
                            <strong>#{installment.sequence_number}</strong>
                            <span>{dateInput(installment.due_on)}</span>
                          </div>
                          <p className="mt-1 font-black">
                            {formatMoney(installment.amount, paymentPlan.currency)}
                          </p>
                          <p className="mt-1 text-slate-500">{label(installment.status)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void createPaymentPlan()
                    }}
                    className="mt-3 grid gap-3 md:grid-cols-3"
                  >
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Plan total"
                      value={planForm.totalAmount}
                      onChange={(event) =>
                        setPlanForm((current) => ({ ...current, totalAmount: event.target.value }))
                      }
                      className="border border-slate-300 px-3 py-2 text-sm"
                      required
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Deposit"
                      value={planForm.depositAmount}
                      onChange={(event) =>
                        setPlanForm((current) => ({
                          ...current,
                          depositAmount: event.target.value,
                        }))
                      }
                      className="border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min="1"
                      max="24"
                      placeholder="Installments"
                      value={planForm.installmentCount}
                      onChange={(event) =>
                        setPlanForm((current) => ({
                          ...current,
                          installmentCount: event.target.value,
                        }))
                      }
                      className="border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={planForm.frequency}
                      onChange={(event) =>
                        setPlanForm((current) => ({ ...current, frequency: event.target.value }))
                      }
                      className="border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Fortnightly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <input
                      type="date"
                      value={planForm.startsOn}
                      onChange={(event) =>
                        setPlanForm((current) => ({ ...current, startsOn: event.target.value }))
                      }
                      className="border border-slate-300 px-3 py-2 text-sm"
                      required
                    />
                    <input
                      value={planForm.lmsPlanId}
                      onChange={(event) =>
                        setPlanForm((current) => ({
                          ...current,
                          lmsPlanId: event.target.value,
                        }))
                      }
                      placeholder="LMS plan reference (optional)"
                      className="border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="bg-slate-900 px-3 py-2 text-xs font-black text-white"
                    >
                      Create schedule
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-black">Tasks</h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void createOperation('task', taskForm)
                  }}
                  className="grid gap-2 border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_11rem_8rem_auto]"
                >
                  <input
                    placeholder="Task title"
                    value={taskForm.title}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, title: event.target.value }))
                    }
                    className="border border-slate-300 px-3 py-2 text-sm"
                    required
                  />
                  <label className="text-[11px] font-bold uppercase text-slate-500">
                    Due date
                    <input
                      type="datetime-local"
                      value={taskForm.dueAt}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, dueAt: event.target.value }))
                      }
                      className="mt-1 w-full border border-slate-300 px-2 py-2 text-xs normal-case text-slate-900"
                    />
                  </label>
                  <select
                    value={taskForm.priority}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, priority: event.target.value }))
                    }
                    className="border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <button title="Add task" className="bg-slate-900 p-2 text-white">
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 border border-slate-200 p-3"
                    >
                      <button
                        title="Complete task"
                        onClick={() =>
                          void updateOperation('task', task.id, {
                            status: task.status === 'completed' ? 'open' : 'completed',
                          })
                        }
                        className={`flex h-6 w-6 items-center justify-center border ${task.status === 'completed' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}
                      >
                        {task.status === 'completed' && <Check className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-bold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                        >
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {task.due_at ? `Due ${formatDateTime(task.due_at)}` : 'No due date'} ·{' '}
                          {task.priority}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-black">Deadlines</h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void createOperation('deadline', deadlineForm)
                  }}
                  className="grid gap-2 border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_11rem_8rem_auto]"
                >
                  <input
                    placeholder="Deadline title"
                    value={deadlineForm.title}
                    onChange={(event) =>
                      setDeadlineForm((current) => ({ ...current, title: event.target.value }))
                    }
                    className="border border-slate-300 px-3 py-2 text-sm"
                    required
                  />
                  <label className="text-[11px] font-bold uppercase text-slate-500">
                    Due date
                    <input
                      type="datetime-local"
                      value={deadlineForm.dueAt}
                      onChange={(event) =>
                        setDeadlineForm((current) => ({ ...current, dueAt: event.target.value }))
                      }
                      className="mt-1 w-full border border-slate-300 px-2 py-2 text-xs normal-case text-slate-900"
                      required
                    />
                  </label>
                  <select
                    value={deadlineForm.severity}
                    onChange={(event) =>
                      setDeadlineForm((current) => ({ ...current, severity: event.target.value }))
                    }
                    className="border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <button title="Add deadline" className="bg-slate-900 p-2 text-white">
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
                <div className="space-y-2">
                  {deadlines.map((deadline) => (
                    <div
                      key={deadline.id}
                      className="flex items-center gap-3 border border-slate-200 p-3"
                    >
                      <CalendarClock className="h-4 w-4 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{deadline.title}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(deadline.due_at)} · {deadline.severity}
                        </p>
                      </div>
                      {deadline.status === 'open' && (
                        <button
                          onClick={() =>
                            void updateOperation('deadline', deadline.id, { status: 'met' })
                          }
                          className="border border-slate-300 px-2 py-1 text-xs font-black"
                        >
                          Met
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4 xl:col-span-2">
                <h3 className="text-sm font-black">Communication log</h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void createOperation('communication', communicationForm)
                  }}
                  className="grid gap-2 border border-slate-200 bg-slate-50 p-3 md:grid-cols-[9rem_9rem_1fr_auto]"
                >
                  <select
                    value={communicationForm.channel}
                    onChange={(event) =>
                      setCommunicationForm((current) => ({
                        ...current,
                        channel: event.target.value,
                      }))
                    }
                    className="border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In person</option>
                    <option value="email">Email</option>
                    <option value="internal">Internal</option>
                  </select>
                  <select
                    value={communicationForm.direction}
                    onChange={(event) =>
                      setCommunicationForm((current) => ({
                        ...current,
                        direction: event.target.value,
                      }))
                    }
                    className="border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="outbound">Outbound</option>
                    <option value="inbound">Inbound</option>
                    <option value="internal">Internal</option>
                  </select>
                  <input
                    placeholder="What happened?"
                    value={communicationForm.summary}
                    onChange={(event) =>
                      setCommunicationForm((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    className="border border-slate-300 px-3 py-2 text-sm"
                    required
                  />
                  <button className="bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white">
                    Log
                  </button>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={communicationForm.followUpRequired}
                      onChange={(event) =>
                        setCommunicationForm((current) => ({
                          ...current,
                          followUpRequired: event.target.checked,
                        }))
                      }
                    />
                    Follow-up required
                  </label>
                  {communicationForm.followUpRequired && (
                    <label className="text-[11px] font-bold uppercase text-slate-500">
                      Follow-up due date
                      <input
                        type="datetime-local"
                        value={communicationForm.followUpDueAt}
                        onChange={(event) =>
                          setCommunicationForm((current) => ({
                            ...current,
                            followUpDueAt: event.target.value,
                          }))
                        }
                        className="mt-1 w-full border border-slate-300 px-2 py-2 text-xs normal-case text-slate-900"
                      />
                    </label>
                  )}
                </form>
                <div className="space-y-2">
                  {communications.map((entry) => (
                    <div
                      key={entry.id}
                      className="border-l-2 border-[#8b1e2d] bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm text-slate-800">{entry.summary}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {label(entry.channel)} · {label(entry.direction)} ·{' '}
                        {formatDateTime(entry.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'voucher' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-sm font-black text-slate-900">Dynamic Transport Voucher</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Final quote details are prefilled. Complete flight, landing, provider, and route
                    timings before releasing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetVoucherFromFinalQuote}
                  className="border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"
                >
                  Use final quote details
                </button>
              </div>

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
                      Provider name
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
                      Provider contact
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
                      <div key={index} className="space-y-2 border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-black text-slate-700">
                            Segment #{index + 1}: {item.type || 'Transport Segment'}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeVoucherItineraryItem(index)}
                            className="text-xs font-black text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          value={item.type}
                          onChange={(event) =>
                            updateVoucherItinerary(index, { type: event.target.value })
                          }
                          placeholder="Airport Pickup"
                          className="w-full border border-slate-300 px-3 py-2 text-sm"
                        />
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
                <button
                  onClick={() => void generateVoucher(false)}
                  disabled={saving === 'voucher' || Boolean(voucherPassengerError)}
                  className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-black"
                >
                  <Save className="h-4 w-4" />
                  Generate internal version
                </button>
                <button
                  onClick={() => void generateVoucher(true)}
                  disabled={saving === 'voucher' || Boolean(voucherPassengerError)}
                  className="inline-flex items-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Generate and release
                </button>
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {vouchers.map((voucher) => (
                        <tr key={voucher.id}>
                          <td className="px-3 py-2 font-black">v{voucher.version}</td>
                          <td className="px-3 py-2">{formatDateTime(voucher.generated_at)}</td>
                          <td className="px-3 py-2">{label(voucher.status)}</td>
                          <td className="px-3 py-2">
                            {voucher.customer_visible ? 'Released' : 'Internal'}
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

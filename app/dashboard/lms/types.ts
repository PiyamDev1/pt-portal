// TypeScript Interfaces for LMS Module

export interface PaymentMethod {
  id: string
  name: string
}

export interface Transaction {
  id: string
  type: 'service' | 'fee' | 'payment'
  amount: number
  date: string
  paymentMethod?: string
  notes?: string
  installmentPlan?: InstallmentPayment[]
  transaction_timestamp?: string
  transaction_type?: string
  remark?: string
  loan_payment_methods?: { name: string }
}

export interface InstallmentPayment {
  id?: number
  dueDate: string
  amount: number
  runningBalance?: number
  status?: string
  isPaid?: boolean
  paidDate?: string | null
}

export interface Account {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  dateOfBirth?: string
  notes?: string
  balance: number
  activeLoans: number
  isOverdue?: boolean
  isDueSoon?: boolean
  nextDue?: string
  transactions?: Transaction[]
}

export interface LMSStats {
  totalOutstanding?: number
  activeAccounts?: number
  overdueAccounts?: number
  dueSoonAccounts?: number
}

export interface LMSData {
  accounts: Account[]
  stats: LMSStats
}

export interface CustomerForm {
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
}

export interface TransactionForm {
  type: 'service' | 'fee' | 'payment'
  amount: string
  paymentMethodId: string
  transactionDate: string
  initialDeposit: string
  firstPaymentDate: string
  installmentTerms: string
  paymentFrequency: 'weekly' | 'biweekly' | 'monthly'
  notes: string
}

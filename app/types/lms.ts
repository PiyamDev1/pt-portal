/**
 * LMS (Loan Management System) Types
 * Centralized type definitions for all LMS-related interfaces
 */

export interface Account {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  dateOfBirth: string | null
  notes: string | null
  status?: string
  balance?: number
  transactions: Transaction[]
  loans?: Loan[]
  [key: string]: unknown // Allow additional fields from API
}

export interface Loan {
  id: string
  created_at: string
  term_months?: number | string
  next_due_date?: string
  [key: string]: unknown
}

export interface Transaction {
  id: string
  account_id: string
  transaction_type: 'service' | 'payment' | 'fee'
  amount: number | string
  description: string | null
  created_at: string
  loan_id?: string
}

export interface InstallmentPayment {
  id: string
  transaction_id: string
  due_date: string
  amount: number | string
  status: 'pending' | 'paid' | 'skipped' | 'partial' | 'overdue'
  paid_date: string | null
  amount_paid: number | string
  installment_number: number
  payment_method?: string
  [key: string]: unknown // Allow additional fields from API
}

export interface StatementData {
  account: Account | null
  loading: boolean
  installmentsByTransaction: Record<string, InstallmentPayment[]>
}

export interface CustomerEditForm {
  phone: string
  email: string
  address: string
  dateOfBirth: string
  notes: string
}

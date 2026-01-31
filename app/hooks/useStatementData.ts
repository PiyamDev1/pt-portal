import { useEffect, useState } from 'react'
import type { Account, Transaction, InstallmentPayment } from '@/app/types/lms'

export const useStatementData = (accountId: string) => {
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<Account | null>(null)
  const [installmentsByTransaction, setInstallmentsByTransaction] = useState<Record<string, InstallmentPayment[]>>({})

  useEffect(() => {
    let isActive = true

    const load = async () => {
      try {
        const res = await fetch(`/api/lms?accountId=${accountId}`)
        const data = await res.json() as Record<string, unknown>
        const accounts = Array.isArray(data.accounts) ? data.accounts as Account[] : []
        const acc = accounts.find((a: Account) => a.id === accountId)
        if (!isActive) return

        setAccount(acc || null)

        if (acc && Array.isArray(acc.transactions)) {
          const serviceTransactions: Transaction[] = acc.transactions.filter((tx: Transaction) =>
            (tx.transaction_type || '').toLowerCase() === 'service'
          )

          if (serviceTransactions.length === 0) {
            setLoading(false)
            return
          }

          const installmentsMap: Record<string, InstallmentPayment[]> = {}
          let fetchedCount = 0

          serviceTransactions.forEach((tx: Transaction) => {
            fetch(`/api/lms/installments?transactionId=${tx.id}`)
              .then(res => res.json())
              .then(data => {
                installmentsMap[tx.id] = data.installments || []
                fetchedCount++

                if (fetchedCount === serviceTransactions.length) {
                  if (!isActive) return
                  setInstallmentsByTransaction(installmentsMap)
                  setLoading(false)
                }
              })
              .catch(() => {
                fetchedCount++
                if (fetchedCount === serviceTransactions.length) {
                  if (!isActive) return
                  setInstallmentsByTransaction(installmentsMap)
                  setLoading(false)
                }
              })
          })
        } else {
          setLoading(false)
        }
      } catch {
        if (!isActive) return
        setLoading(false)
      }
    }

    load()

    return () => {
      isActive = false
    }
  }, [accountId])

  return {
    loading,
    account,
    installmentsByTransaction
  }
}

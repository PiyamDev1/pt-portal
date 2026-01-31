import { useEffect, useState } from 'react'

export const useStatementData = (accountId: string) => {
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<any>(null)
  const [installmentsByTransaction, setInstallmentsByTransaction] = useState<Record<string, any[]>>({})

  useEffect(() => {
    let isActive = true

    const load = async () => {
      try {
        const res = await fetch(`/api/lms?accountId=${accountId}`)
        const data = await res.json()
        const acc = data.accounts?.find((a: any) => a.id === accountId)
        if (!isActive) return

        setAccount(acc)

        if (acc && acc.transactions) {
          const serviceTransactions = acc.transactions.filter((tx: any) =>
            (tx.transaction_type || '').toLowerCase() === 'service'
          )

          if (serviceTransactions.length === 0) {
            setLoading(false)
            return
          }

          const installmentsMap: Record<string, any[]> = {}
          let fetchedCount = 0

          serviceTransactions.forEach((tx: any) => {
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

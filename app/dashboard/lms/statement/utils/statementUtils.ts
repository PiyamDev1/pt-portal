export interface GeneratedInstallment {
  date: string
  amount: number
  remaining: number
}

export function generateInstallmentSchedule(
  startDate: string,
  totalAmount: number,
  initialDeposit: number,
  termMonths: number,
  nextDueDate?: string
): GeneratedInstallment[] {
  // Calculate the remaining amount after initial deposit
  const remainingAfterDeposit = totalAmount - initialDeposit
  // Divide equally across all terms
  const installmentAmount = remainingAfterDeposit / termMonths
  const schedule: GeneratedInstallment[] = []
  
  const firstDueDate = nextDueDate ? new Date(nextDueDate) : new Date(startDate)
  
  for (let i = 0; i < termMonths; i++) {
    const dueDate = new Date(firstDueDate)
    dueDate.setMonth(dueDate.getMonth() + i)
    
    // Calculate remaining balance after this installment
    const remaining = remainingAfterDeposit - (installmentAmount * (i + 1))
    schedule.push({
      date: dueDate.toISOString(),
      amount: installmentAmount,
      remaining: Math.max(0, remaining)
    })
  }
  
  return schedule
}

export function generateCSV(transactions: any[]): string {
  const headers = ['Date', 'Type', 'Description', 'Debit', 'Credit']
  const rows = transactions.map(tx => [
    new Date(tx.transaction_timestamp).toLocaleDateString(),
    (tx.transaction_type || '').toLowerCase(),
    tx.remark || '',
    ((tx.transaction_type || '').toLowerCase() === 'service' || (tx.transaction_type || '').toLowerCase() === 'fee') ? parseFloat(tx.amount).toFixed(2) : '',
    ((tx.transaction_type || '').toLowerCase() === 'payment') ? parseFloat(tx.amount).toFixed(2) : ''
  ])
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n')
  
  return csv
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

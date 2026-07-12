export function createPackageInstallmentSchedule(input: {
  totalAmount: number
  depositAmount?: number
  installmentCount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'custom'
  startsOn: string
}) {
  const total = Math.max(0, Math.round(input.totalAmount * 100) / 100)
  const deposit = Math.min(
    total,
    Math.max(0, Math.round(Number(input.depositAmount || 0) * 100) / 100),
  )
  const count = Math.max(1, Math.min(24, Math.floor(input.installmentCount)))
  const remainderPence = Math.round((total - deposit) * 100)
  const basePence = Math.floor(remainderPence / count)
  const extraPence = remainderPence - basePence * count
  const start = new Date(`${input.startsOn}T12:00:00.000Z`)
  if (Number.isNaN(start.getTime())) throw new Error('A valid installment start date is required')

  return Array.from({ length: count }, (_, index) => {
    const due = new Date(start)
    if (input.frequency === 'weekly') due.setUTCDate(due.getUTCDate() + index * 7)
    else if (input.frequency === 'fortnightly') due.setUTCDate(due.getUTCDate() + index * 14)
    else due.setUTCMonth(due.getUTCMonth() + index)
    return {
      sequence_number: index + 1,
      amount: (basePence + (index < extraPence ? 1 : 0)) / 100,
      due_on: due.toISOString().slice(0, 10),
      status: 'scheduled' as const,
    }
  })
}

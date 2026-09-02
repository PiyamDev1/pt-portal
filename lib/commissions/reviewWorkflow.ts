export type CommissionWorkflowDatabaseError = {
  code?: string | null
  hint?: string | null
}

export function commissionWorkflowDatabaseError(error: CommissionWorkflowDatabaseError | null) {
  const code = String(error?.code || '')
  const hint = String(error?.hint || '')

  if (code === '42501') return { message: 'Forbidden', status: 403 }
  if (code === 'P0002') {
    return { message: 'The requested Commission record was not found.', status: 404 }
  }
  if (code === '40001') {
    return { message: 'The Commission review changed. Reload it and try again.', status: 409 }
  }
  if (code === '23505') {
    return { message: 'That Commission month already has a review batch.', status: 409 }
  }
  if (code === '55000') {
    if (hint === 'COMMISSION_REVIEW_PERIOD_LOCKED') {
      return {
        message:
          'This reporting period is locked for Commission review. Return the batch before posting a correction.',
        status: 409,
      }
    }
    if (hint === 'COMMISSION_REVIEW_STALE') {
      return {
        message: 'Commission results changed after preparation. Prepare the month again.',
        status: 409,
      }
    }
    return {
      message: 'This Commission month is not ready for Accounting review.',
      status: 409,
    }
  }
  if (code === '22023' || code === '23514') {
    return { message: 'The Commission workflow request is invalid.', status: 400 }
  }
  if (code === '42P01' || code === '42883' || code === 'PGRST202') {
    return { message: 'The latest Commission review workflow is not installed.', status: 503 }
  }
  return { message: 'Commission workflow request failed.', status: 500 }
}

export function commissionCalendarMonthBounds(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || month < 1 || month > 12) {
    return null
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    periodStart: `${match[1]}-${match[2]}-01`,
    periodEnd: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  }
}

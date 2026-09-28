export function formatMoney(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Math.abs(value))
}

export function formatSignedMoney(value: number) {
  return `${value < 0 ? '−' : '+'}${formatMoney(value)}`
}

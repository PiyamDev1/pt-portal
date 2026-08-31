export async function collectPagedRows<T>(
  loadPage: (offset: number, pageSize: number) => Promise<T[]>,
  pageSize = 1000,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('Performance page size must be a positive integer')
  }

  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await loadPage(offset, pageSize)
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'
import {
  listLegacyBookingCustomers,
  testLegacyBookingsConnections,
} from '@/lib/legacyBookingsMigration'

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdminSession()
  if (!auth.authorized) return auth.response
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = typeof body.action === 'string' ? body.action : 'scan'
  if (action === 'test') {
    const connections = await testLegacyBookingsConnections()
    return apiOk({ connections })
  }

  try {
    const result = await listLegacyBookingCustomers({
      pageSize: Math.max(1, Math.min(100, Number(body.limit || 50))),
      pageToken: typeof body.pageToken === 'string' ? body.pageToken : undefined,
    })
    return apiOk({
      customers: result.customers.map((customer) => ({
        id: customer.id,
        referenceNumber: customer.referenceNumber,
        customerName: customer.customerName,
        packageType: customer.packageType,
        destination: customer.destination,
        status: customer.status,
        archived: customer.archived,
        documentCount: customer.documents.length,
      })),
      summary: {
        customerCount: result.customers.length,
        documentCount: result.customers.reduce(
          (total, customer) => total + customer.documents.length,
          0,
        ),
        missingReferences: result.customers.filter((customer) => !customer.referenceNumber).length,
        missingLastNames: result.customers.filter((customer) => !customer.lastName).length,
      },
      nextPageToken: result.nextPageToken,
    })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Legacy scan failed', 502)
  }
}

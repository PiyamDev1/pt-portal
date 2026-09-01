import { customerBookingCatalog } from '@/lib/customerPortal/appointments'
import { authenticateCustomerIntegration } from '@/lib/customerPortal/integrationAuth'
import { customerIntegrationOk, withCustomerIntegrationRoute } from '@/lib/customerPortal/http'

export const GET = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  return customerIntegrationOk(await customerBookingCatalog(), context.requestId)
})

import { customerTripFromGrant } from '@/lib/customerPortal/trips'
import { authenticateCustomerIntegration } from '@/lib/customerPortal/integrationAuth'
import {
  CustomerIntegrationError,
  customerIntegrationOk,
  withCustomerIntegrationRoute,
} from '@/lib/customerPortal/http'

export const GET = withCustomerIntegrationRoute(
  async (request, context: { params: Promise<{ tripId: string }> }) => {
    const auth = await authenticateCustomerIntegration(request)
    const { tripId } = await context.params
    const token = request.headers.get('x-piyam-access-grant') ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(tripId) || !token) {
      throw new CustomerIntegrationError('not_found', 'Trip not found.', 404)
    }
    const result = await customerTripFromGrant({
      publicId: tripId,
      token,
      requiredScope: 'read',
      customerSubject: request.headers.get('x-piyam-customer-subject') ?? undefined,
    })
    return customerIntegrationOk(result.trip, auth.requestId)
  },
)

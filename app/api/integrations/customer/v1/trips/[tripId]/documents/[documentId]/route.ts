import { authenticateCustomerIntegration } from '@/lib/customerPortal/integrationAuth'
import { CustomerIntegrationError, withCustomerIntegrationRoute } from '@/lib/customerPortal/http'
import {
  customerTripFromGrant,
  documentForTrip,
  streamTripDocument,
} from '@/lib/customerPortal/trips'

export const GET = withCustomerIntegrationRoute(
  async (request, context: { params: Promise<{ tripId: string; documentId: string }> }) => {
    const auth = await authenticateCustomerIntegration(request)
    const { tripId, documentId } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(tripId) || !/^[0-9a-f-]{36}$/i.test(documentId)) {
      throw new CustomerIntegrationError('not_found', 'Document not found.', 404)
    }
    const access = await customerTripFromGrant({
      publicId: tripId,
      token: request.headers.get('x-piyam-access-grant') ?? '',
      requiredScope: 'documents',
      customerSubject: request.headers.get('x-piyam-customer-subject') ?? undefined,
    })
    const document = await documentForTrip({
      tripInternalId: access.grant.internalId,
      documentPublicId: documentId,
    })
    const disposition =
      new URL(request.url).searchParams.get('disposition') === 'attachment'
        ? 'attachment'
        : 'inline'
    const stream = await streamTripDocument({
      document,
      disposition,
      range: request.headers.get('range'),
    })
    return new Response(stream.body, {
      status: stream.status,
      headers: { ...stream.headers, 'x-request-id': auth.requestId },
    })
  },
)

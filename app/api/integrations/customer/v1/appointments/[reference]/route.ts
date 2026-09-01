import { z } from 'zod'

import {
  customerAppointmentByReference,
  updateCustomerAppointment,
} from '@/lib/customerPortal/appointments'
import { recordCustomerPortalAudit } from '@/lib/customerPortal/audit'
import {
  authenticateCustomerIntegration,
  claimCustomerIdempotency,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import {
  CustomerIntegrationError,
  customerIntegrationCached,
  customerIntegrationOk,
  withCustomerIntegrationRoute,
} from '@/lib/customerPortal/http'

const updateSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    contactName: z.string().trim().min(2).max(100).optional(),
    contactPhone: z.string().trim().min(5).max(40).optional(),
    groupSize: z.number().int().min(1).max(100).optional(),
    slotId: z.string().uuid().optional(),
    action: z.enum(['update', 'cancel']),
    managementGrant: z.string().min(40).max(2048),
  })
  .strict()

export const GET = withCustomerIntegrationRoute<{
  params: Promise<{ reference: string }>
}>(async (request, routeContext) => {
  const context = await authenticateCustomerIntegration(request)
  const { reference } = await routeContext.params
  if (!/^APT-[A-F0-9]{16}$/.test(reference)) {
    throw new CustomerIntegrationError('not_found', 'Appointment not found.', 404)
  }
  const grant = request.headers.get('x-piyam-access-grant') ?? ''
  return customerIntegrationOk(
    await customerAppointmentByReference(reference, grant),
    context.requestId,
  )
})

export const PATCH = withCustomerIntegrationRoute<{
  params: Promise<{ reference: string }>
}>(async (request, routeContext) => {
  const context = await authenticateCustomerIntegration(request, {
    requireIdempotency: true,
  })
  const { reference } = await routeContext.params
  if (!/^APT-[A-F0-9]{16}$/.test(reference)) {
    throw new CustomerIntegrationError('not_found', 'Appointment not found.', 404)
  }
  const claim = await claimCustomerIdempotency(context, `appointment-update:${reference}`)
  if (claim.cached) {
    return customerIntegrationCached(claim.cached.body, claim.cached.status, context.requestId)
  }
  const input = parseIntegrationJson(context, (value) => updateSchema.parse(value))
  const appointment = await updateCustomerAppointment({
    publicReference: reference,
    grantToken: input.managementGrant,
    expectedVersion: input.expectedVersion,
    action: input.action,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    groupSize: input.groupSize,
    slotPublicId: input.slotId,
  })
  await recordCustomerPortalAudit({
    requestId: context.requestId,
    eventType: input.action === 'cancel' ? 'appointment_cancelled' : 'appointment_modified',
    actorKind: 'customer',
    resourceType: 'appointment',
    outcome: 'success',
  })
  const body = { data: appointment, error: null, requestId: context.requestId }
  await claim.complete(200, body)
  return customerIntegrationOk(appointment, context.requestId)
})

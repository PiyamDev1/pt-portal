import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireAccountingAccess } from '@/lib/accounting/access'
import { POS_PRIVATE_RESPONSE, posErrorResponse, posIdempotencyKey } from '@/lib/pos/http'
import { posConfigurationMutationSchema } from '@/lib/pos/inputContracts'
import { runPosMutation } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function relatedName(value: unknown) {
  const related = value as { name?: string } | Array<{ name?: string }> | null
  return (Array.isArray(related) ? related[0]?.name : related?.name) || 'Supplier'
}

export async function GET() {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response
  const service = getServiceSupabaseClient()
  const [categories, services, suppliers, assignments] = await Promise.all([
    service.from('pos_categories').select('*').order('display_order'),
    service
      .from('pos_catalogue_items')
      .select(
        'id,item_key,category_id,label,option_label,classification,default_direction,allowed_payment_methods,source_required,customer_required,note_required,price_required,loyalty_eligible,points_per_gbp,logo_key,display_order,is_active,is_system_action,is_quick_entry',
      )
      .order('display_order'),
    service
      .from('pos_supplier_profiles')
      .select(
        'supplier_vendor_id,alternate_names,source_area,source_reference,is_active,supplier_vendors(name)',
      )
      .order('created_at'),
    service.from('pos_category_suppliers').select('*'),
  ])
  const failure = [categories, services, suppliers, assignments].find((result) => result.error)
  if (failure?.error) return posErrorResponse(failure.error)
  return apiOk(
    {
      categories: categories.data || [],
      services: (services.data || []).filter(
        (item) => !item.is_system_action && item.is_quick_entry,
      ),
      suppliers: (suppliers.data || []).map((supplier) => ({
        ...supplier,
        name: relatedName(supplier.supplier_vendors),
      })),
      assignments: assignments.data || [],
    },
    POS_PRIVATE_RESPONSE,
  )
}

export async function POST(request: Request) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'accounting.pos-configuration',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const idempotencyKey = posIdempotencyKey(request)
  if (!idempotencyKey)
    return apiError('A valid Idempotency-Key header is required.', 400, {}, POS_PRIVATE_RESPONSE)
  const { data, error } = await parseBodyWithSchema(request, posConfigurationMutationSchema, {
    maxBytes: 32 * 1024,
  })
  if (!data || error)
    return apiError(error || 'Invalid POS configuration.', 400, {}, POS_PRIVATE_RESPONSE)
  try {
    return apiOk(
      await runPosMutation('pos_manage_configuration_v2', access.employee.id, idempotencyKey, data),
      { status: 201, ...POS_PRIVATE_RESPONSE },
    )
  } catch (mutationError) {
    return posErrorResponse(mutationError)
  }
}

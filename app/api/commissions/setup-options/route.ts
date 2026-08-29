import { apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
} from '@/lib/commissions/api'

export async function GET() {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }

  const service = getServiceSupabaseClient()
  const [employees, locations, versions] = await Promise.all([
    service
      .from('employees')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')
      .limit(1000),
    service.from('locations').select('id, name, branch_code').order('name').limit(500),
    service
      .from('commission_policy_versions')
      .select('id, rule_id, version_number, status')
      .eq('status', 'active')
      .order('version_number', { ascending: false })
      .limit(500),
  ])
  if (employees.error || locations.error || versions.error) {
    return commissionError('Unable to load Commission setup options.', 500)
  }

  const ruleIds = [...new Set((versions.data || []).map((version) => version.rule_id))]
  const { data: rules, error: ruleError } = ruleIds.length
    ? await service.from('commission_rules').select('id, rule_name').in('id', ruleIds)
    : { data: [], error: null }
  if (ruleError) return commissionError('Unable to resolve Commission policy labels.', 500)

  return apiOk(
    {
      employees: (employees.data || []).map((employee) => ({
        id: employee.id,
        name: employee.full_name || employee.email || 'Unnamed employee',
        email: employee.email,
      })),
      locations: (locations.data || []).map((location) => ({
        id: location.id,
        name: location.name,
        branchCode: location.branch_code,
      })),
      activePolicyVersions: (versions.data || []).map((version) => ({
        id: version.id,
        policyId: version.rule_id,
        policyName:
          rules?.find((rule) => rule.id === version.rule_id)?.rule_name || 'Unknown policy',
        versionNumber: version.version_number,
      })),
      canManageGrants: access.canManageGrants,
    },
    COMMISSION_PRIVATE_RESPONSE,
  )
}

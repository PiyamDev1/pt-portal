import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { derivePackageWorkflow } from '@/lib/packageWorkflow'
import type {
  TravelPackageDocument,
  TravelPackageFolder,
  TravelPackageInvoice,
  TravelPackageInstallment,
  TravelPackagePayment,
  TravelPackageReservation,
  TravelPackageTransportVoucher,
} from '@/app/types/packages'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const [
    packageResult,
    reservationResult,
    documentResult,
    invoiceResult,
    paymentResult,
    voucherResult,
    installmentResult,
  ] = await Promise.all([
    supabase.from('travel_packages').select('*').eq('id', id).single(),
    supabase.from('travel_package_reservations').select('*').eq('package_id', id),
    supabase
      .from('travel_package_documents')
      .select('*')
      .eq('package_id', id)
      .neq('status', 'deleted'),
    supabase
      .from('travel_package_invoices')
      .select('*')
      .eq('package_id', id)
      .neq('status', 'void')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('travel_package_payments').select('*').eq('package_id', id),
    supabase.from('travel_package_transport_vouchers').select('*').eq('package_id', id),
    supabase.from('travel_package_installments').select('*').eq('package_id', id),
  ])
  if (packageResult.error || !packageResult.data) return apiError('Travel package not found', 404)

  const workflow = derivePackageWorkflow({
    packageFolder: packageResult.data as unknown as TravelPackageFolder,
    reservations: (reservationResult.data || []) as unknown as TravelPackageReservation[],
    documents: (documentResult.data || []) as unknown as TravelPackageDocument[],
    invoice: (invoiceResult.data || null) as unknown as TravelPackageInvoice | null,
    payments: (paymentResult.data || []) as unknown as TravelPackagePayment[],
    vouchers: (voucherResult.data || []) as unknown as TravelPackageTransportVoucher[],
    installments: (installmentResult.data || []) as unknown as TravelPackageInstallment[],
  })

  const today = new Date().toISOString().slice(0, 10)
  for (const installment of installmentResult.data || []) {
    if (
      ['scheduled', 'due'].includes(String(installment.status)) &&
      String(installment.due_on) < today
    ) {
      await supabase
        .from('travel_package_installments')
        .update({ status: 'overdue' })
        .eq('id', installment.id)
    }
  }

  const { data: existingRiskData } = await supabase
    .from('travel_package_risk_flags')
    .select('*')
    .eq('package_id', id)
    .eq('source', 'automatic')
    .neq('status', 'resolved')
  const existingRisks = existingRiskData || []
  const currentTypes = new Set(workflow.risks.map((risk) => risk.riskType))

  for (const risk of existingRisks) {
    if (!currentTypes.has(String(risk.risk_type))) {
      await supabase
        .from('travel_package_risk_flags')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_note: 'Automatically resolved.',
        })
        .eq('id', risk.id)
    }
  }
  for (const risk of workflow.risks) {
    const existing = existingRisks.find((item) => item.risk_type === risk.riskType)
    const payload = {
      severity: risk.severity,
      title: risk.title,
      description: risk.description,
      due_at: risk.dueAt || null,
    }
    if (existing) {
      await supabase.from('travel_package_risk_flags').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('travel_package_risk_flags').insert({
        package_id: id,
        risk_type: risk.riskType,
        status: 'open',
        source: 'automatic',
        ...payload,
      })
    }
  }

  const { data: existingTask } = await supabase
    .from('travel_package_tasks')
    .select('id, title')
    .eq('package_id', id)
    .eq('source_rule', 'primary_next_action')
    .in('status', ['open', 'in_progress'])
    .limit(1)
    .maybeSingle()
  if (existingTask) {
    await supabase
      .from('travel_package_tasks')
      .update({
        title: workflow.nextAction,
        due_at: workflow.nextActionDueAt,
        priority:
          workflow.riskLevel === 'critical'
            ? 'critical'
            : workflow.riskLevel === 'high'
              ? 'high'
              : 'medium',
      })
      .eq('id', existingTask.id)
  } else if (!['Package complete and earned', 'No action required'].includes(workflow.nextAction)) {
    await supabase.from('travel_package_tasks').insert({
      package_id: id,
      title: workflow.nextAction,
      task_type: 'next_action',
      status: 'open',
      priority:
        workflow.riskLevel === 'critical'
          ? 'critical'
          : workflow.riskLevel === 'high'
            ? 'high'
            : 'medium',
      assigned_to:
        (packageResult.data as { assigned_agent_id?: string | null }).assigned_agent_id || user.id,
      due_at: workflow.nextActionDueAt,
      auto_generated: true,
      source_rule: 'primary_next_action',
    })
  }

  const { data: updatedPackage, error: updateError } = await supabase
    .from('travel_packages')
    .update({
      next_action: workflow.nextAction,
      next_action_due_at: workflow.nextActionDueAt,
      risk_level: workflow.riskLevel,
      payment_status: workflow.paymentStatus,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (updateError) return apiError(updateError.message || 'Failed to sync package workflow', 500)

  return apiOk({ package: updatedPackage, workflow })
}

'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { CommissionRate } from '@/lib/commissions/contracts'
import type { CommissionAdminEmployee, CommissionAdminProfile } from '@/lib/commissions/server'

export function moneyFormatter(currency = 'GBP') {
  return new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  })
}

function rateLabel(
  rate: CommissionRate,
  packageRate = false,
  currency = 'GBP',
  eventNoun = 'booking',
) {
  const formatter = moneyFormatter(currency)
  if (rate.kind === 'none') return `${formatter.format(0)} · explicitly off`
  if (rate.kind === 'full_difference') return 'Full supplier fare increase'
  if (rate.kind === 'percentage')
    return `${rate.value}% of ${packageRate ? 'final profit' : 'value'}`
  if (rate.kind === 'per_event')
    return `${formatter.format(rate.value)} per ${packageRate ? 'package' : eventNoun}`
  if (rate.kind === 'per_unit')
    return `${formatter.format(rate.value)} per ${packageRate ? 'passenger' : 'ticket'}`
  return packageRate
    ? `${rate.tiers.length} passenger band${rate.tiers.length === 1 ? '' : 's'} per package`
    : `${rate.tiers.length} marginal tier${rate.tiers.length === 1 ? '' : 's'}`
}

export default function CommissionProfileSummary({
  profile,
  employees,
}: {
  profile: CommissionAdminProfile
  employees: CommissionAdminEmployee[]
}) {
  const config = profile.configuration
  if (!config)
    return (
      <p className="text-sm text-slate-500">
        Detailed rates are unavailable for this historical profile.
      </p>
    )

  const rows: Array<[string, CommissionRate, boolean?, string?]> = [
    ['Ticket sales', config.services.tkPrimary],
    ['Ticket assistance', config.services.tkAssistance],
    ['Date changes', config.services.dateChange],
    ['Reissues', config.services.reissue],
    ['Low-fare savings', config.services.lowFare],
    ['Supplier fare increase adjustment', config.services.higherFare],
    ['Package sales', config.services.packageSale, true],
    [
      'NADRA applications - normal',
      config.services.applicationNadra,
      false,
      'completed application',
    ],
    [
      'NADRA applications - urgent',
      config.services.applicationNadraUrgent,
      false,
      'completed application',
    ],
    [
      'Pakistani passport applications - normal',
      config.services.applicationPassportPk,
      false,
      'collected application',
    ],
    [
      'Pakistani passport applications - urgent',
      config.services.applicationPassportPkUrgent,
      false,
      'collected application',
    ],
    [
      'British passport applications',
      config.services.applicationPassportGb,
      false,
      'completed application',
    ],
    ['Visa applications', config.services.applicationVisa, false, 'completed application'],
  ]
  const applicationRoutingLabel =
    config.applicationRouting.mode === 'self'
      ? 'Paid to this employee'
      : config.applicationRouting.mode === 'none'
        ? 'No Application commission'
        : `Redirected to ${
            employees.find(
              (employee) => employee.id === config.applicationRouting.recipientEmployeeId,
            )?.fullName || 'Former staff member'
          } at their own rate`

  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      {rows
        .filter(
          ([label]) =>
            config.applicationRouting.mode === 'self' ||
            !label.toLowerCase().includes('applications'),
        )
        .map(([label, rate, packageRate, eventNoun]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm"
          >
            <span className="text-slate-500">{label}</span>
            <span className="text-right font-black text-slate-800">
              {rateLabel(
                rate,
                packageRate,
                rate.currency || config.compensation.currency,
                eventNoun,
              )}
            </span>
          </div>
        ))}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm sm:col-span-2">
        <span className="text-slate-500">Ticket assistance applies to</span>
        <span className="max-w-md text-right font-black text-slate-800">
          {config.services.tkAssistance.kind === 'none'
            ? 'Not applicable'
            : config.assistanceScope.mode === 'all'
              ? 'All primary agents'
              : config.assistanceScope.employeeIds
                  .map((id) => {
                    const name =
                      employees.find((employee) => employee.id === id)?.fullName || 'Former staff'
                    const rate = config.assistanceScope.agentRates.find(
                      (item) => item.employeeId === id,
                    )
                    return rate
                      ? `${name} · ${moneyFormatter(
                          config.services.tkAssistance.currency || config.compensation.currency,
                        ).format(rate.value)}`
                      : name
                  })
                  .join(', ')}
        </span>
      </div>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm sm:col-span-2">
        <span className="text-slate-500">Application commission recipient</span>
        <span className="max-w-md text-right font-black text-slate-800">
          {applicationRoutingLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
        <span className="text-slate-500">Default commission currency and salary</span>
        <span className="text-right font-black text-slate-800">
          Commission {config.compensation.currency} · salary{' '}
          {moneyFormatter(
            config.compensation.salaryCurrency || config.compensation.currency,
          ).format(config.compensation.monthlySalary)}
          /month
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
        <span className="text-slate-500">Hourly pay context</span>
        <span className="text-right font-black text-slate-800">
          {config.compensation.hourlyRate && config.compensation.hourlyRate > 0
            ? `${moneyFormatter(
                config.compensation.salaryCurrency || config.compensation.currency,
              ).format(config.compensation.hourlyRate)} / hour`
            : 'Not configured'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm sm:col-span-2">
        <span className="text-slate-500">Attendance context</span>
        <Link
          href="/dashboard/timeclock/team"
          className="inline-flex items-center gap-1.5 font-black text-[#8b1e2d] transition hover:text-[#5f111d]"
        >
          Review team punches <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
        <span className="text-slate-500">Confirmed ticket refunds</span>
        <span className="text-right font-black text-slate-800">
          {config.ticketRefundCommission.treatment === 'reverse_original'
            ? 'Reverse original commission'
            : 'Retain original commission'}
        </span>
      </div>
      {config.services.tkPrimary.kind === 'tiered' && (
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
          <span className="text-slate-500">Date changes count toward tiers</span>
          <span className="text-right font-black text-slate-800">
            {config.ticketTierOptions.includeDateChanges ? 'Yes' : 'No'}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
        <span className="text-slate-500">Monthly bonus</span>
        <span className="text-right font-black text-slate-800">
          {config.monthlyBonus.enabled
            ? `${config.monthlyBonus.steps.length || 1} target${
                (config.monthlyBonus.steps.length || 1) === 1 ? '' : 's'
              }${config.monthlyBonus.recurring.enabled ? ' + recurring bonus' : ''}`
            : 'Not included'}
        </span>
      </div>
    </div>
  )
}

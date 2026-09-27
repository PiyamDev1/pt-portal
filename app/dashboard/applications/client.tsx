'use client'

import {
  getApplicationSourceVisibility,
  totalVisibleApplicationMetrics,
  type ApplicationSourceKey,
  type ApplicationSummary,
} from '@/lib/applications/summary'
import { ApplicationsHubBody } from './components/ApplicationsHubBody'

type Props = {
  summary: ApplicationSummary
  roleName: string
  locationName: string
}

const SERVICE_PRESENTATION: Record<ApplicationSourceKey, { flag: string; color: string }> = {
  nadra: { flag: '🆔', color: 'bg-[#1f5c38]' },
  'pak-passport': { flag: '🇵🇰', color: 'bg-[#014f26]' },
  'gb-passport': { flag: '🇬🇧', color: 'bg-[#1e3a5f]' },
  visa: { flag: '🛂', color: 'bg-[#5b21b6]' },
}

export default function ApplicationsClient({ summary, roleName, locationName }: Props) {
  const visibility = getApplicationSourceVisibility(roleName)
  const totals = totalVisibleApplicationMetrics(summary, visibility)
  const visibleServices = (['pak-passport', 'gb-passport', 'nadra', 'visa'] as const).map((key) => {
    const source = summary.sources[key]
    return {
      key,
      visible: visibility[key],
      meta: {
        ...SERVICE_PRESENTATION[key],
        title: source.title,
        href: source.href,
        attentionLabel:
          source.metrics.attention === 1 ? 'application needs review' : 'applications need review',
        metrics: source.metrics,
      },
    }
  })
  const allRecent = summary.recent.filter((record) => visibility[record.service])
  const attentionRecords = summary.attentionItems.filter((record) => visibility[record.service])
  const dataWarnings = summary.warnings.filter((warning) => visibility[warning.source])

  return (
    <ApplicationsHubBody
      stalledTotal={totals.stalled}
      pakStalled={visibility['pak-passport'] ? summary.sources['pak-passport'].metrics.stalled : 0}
      gbStalled={visibility['gb-passport'] ? summary.sources['gb-passport'].metrics.stalled : 0}
      nadraStalled={visibility.nadra ? summary.sources.nadra.metrics.stalled : 0}
      visaStalled={visibility.visa ? summary.sources.visa.metrics.stalled : 0}
      dataWarnings={dataWarnings}
      locationName={locationName}
      grandTotal={totals.total}
      grandActive={totals.active}
      grandDone={totals.done}
      grandAttention={totals.attention}
      newToday={totals.newToday}
      newWeek={totals.newWeek}
      doneWeek={totals.doneWeek}
      visibleServices={visibleServices}
      allRecent={allRecent}
      attentionRecords={attentionRecords}
    />
  )
}

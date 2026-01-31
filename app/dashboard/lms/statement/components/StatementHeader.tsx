import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { memo } from 'react'

interface StatementHeaderProps {
  accountId: string
}

function StatementHeaderComponent({ accountId }: StatementHeaderProps) {
  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 print:hidden">
      <Link href="/dashboard/lms" className="inline-flex items-center gap-2 text-white hover:text-slate-100 transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to Accounts
      </Link>
      <h1 className="text-3xl font-bold">Statement</h1>
    </div>
  )
}

export const StatementHeader = memo(StatementHeaderComponent)

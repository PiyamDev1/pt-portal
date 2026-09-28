/**
 * Nadra Documents Page
 * Document management interface for family-level document sharing
 * All applicants in a family can access shared documents
 *
 * Route: /dashboard/applications/nadra/documents/[familyHeadId]
 */

import { notFound } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import { ApplicationDocumentHub } from '@/app/dashboard/applications/components/ApplicationDocumentHub'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Document Management - Nadra Applications',
  description: 'Manage documents shared by the family for all applicants',
}

interface NadraDocumentsPageProps {
  params: Promise<{
    familyHeadId: string
  }>
}

export default async function NadraDocumentsPage({ params }: NadraDocumentsPageProps) {
  const { familyHeadId } = await params

  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()

  // Fetch family head data (document owner) - family heads are in applicants table
  const { data: familyHead } = await supabase
    .from('applicants')
    .select('id, first_name, last_name, citizen_number, email, phone_number')
    .eq('id', familyHeadId)
    .single()

  // Handle family head not found
  if (!familyHead) {
    notFound()
  }

  const familyHeadFullName = `${familyHead.first_name} ${familyHead.last_name}`

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Page Header */}
        <PageHeader
          employeeName={employeeName}
          role={role}
          location={location}
          userId={userId}
          showBack={true}
          backHref="/dashboard/applications/nadra"
          backLabel="Nadra Services"
        />

        {/* Main Content */}
        <main className="flex-1 max-w-7xl mx-auto p-6 w-full">
          {/* Document Hub */}
          <div className="min-h-[calc(100vh-280px)] rounded-lg">
            <ApplicationDocumentHub
              familyHeadId={familyHeadId}
              familyHeadName={familyHeadFullName}
              showStatus={true}
              zipFileName={familyHead.citizen_number || familyHeadId}
            />
          </div>
        </main>
      </div>
    </DashboardClientWrapper>
  )
}

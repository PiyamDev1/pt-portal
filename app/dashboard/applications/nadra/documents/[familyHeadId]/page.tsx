/**
 * Nadra Documents Page
 * Document management interface for family-level document sharing
 * All applicants in a family can access shared documents
 * 
 * Route: /dashboard/applications/nadra/documents/[familyHeadId]
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import { DocumentHub } from '../../components/DocumentHub'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
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

export default async function NadraDocumentsPage({
  params,
}: NadraDocumentsPageProps) {
  const { familyHeadId } = await params

  // Initialize Supabase client
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/login')
  }

  // Fetch employee data
  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

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

  const location = Array.isArray(employee?.locations)
    ? employee.locations[0]
    : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  const familyHeadFullName = `${familyHead.first_name} ${familyHead.last_name}`

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Page Header */}
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
          showBack={true}
        />

        {/* Main Content */}
        <main className="flex-1 max-w-7xl mx-auto p-6 w-full">
          {/* Breadcrumb/Back Button */}
          <div className="mb-6">
            <a
              href="/dashboard/applications/nadra"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium mb-4"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Nadra Services
            </a>
          </div>

          {/* Document Hub */}
          <div className="min-h-[calc(100vh-280px)] rounded-lg">
            <DocumentHub
              familyHeadId={familyHeadId}
              familyHeadName={familyHeadFullName}
              showStatus={true}
            />
          </div>
        </main>
      </div>
    </DashboardClientWrapper>
  )
}

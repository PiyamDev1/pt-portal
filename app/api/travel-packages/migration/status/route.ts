import { apiOk } from '@/lib/api/http'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  getLegacyBookingsFirebaseConfig,
  getPackageBackupStorageConfig,
} from '@/lib/packageIntegrations'

export async function GET() {
  const auth = await requireSuperAdminSession()
  if (!auth.authorized) return auth.response
  const supabase = getServiceSupabaseClient()
  const [runResult, mapResult, packageResult, documentResult, failedBackupResult] =
    await Promise.all([
      supabase
        .from('travel_package_legacy_migration_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('travel_package_legacy_migration_map')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('travel_package_legacy_migration_map')
        .select('id', { count: 'exact', head: true })
        .in('migration_status', ['imported', 'partial']),
      supabase
        .from('travel_package_documents')
        .select('id', { count: 'exact', head: true })
        .contains('metadata', { legacy: true }),
      supabase
        .from('travel_package_documents')
        .select('id', { count: 'exact', head: true })
        .eq('backup_status', 'failed'),
    ])
  return apiOk({
    configuration: {
      firebase: Boolean(getLegacyBookingsFirebaseConfig()),
      sourceStorage: Boolean(getPackageBackupStorageConfig()),
    },
    counts: {
      migrationRecords: mapResult.count || 0,
      importedPackages: packageResult.count || 0,
      migratedDocuments: documentResult.count || 0,
      failedBackups: failedBackupResult.count || 0,
    },
    runs: runResult.data || [],
    records: mapResult.data || [],
  })
}

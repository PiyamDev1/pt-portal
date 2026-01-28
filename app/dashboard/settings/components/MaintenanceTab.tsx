'use client'

import { useState } from 'react'
import { Database, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export function MaintenanceTab() {
  const [migrating, setMigrating] = useState(false)
  const [result, setResult] = useState<any>(null)

  const migrateInstallments = async () => {
    if (!confirm('This will create installment records for all existing service transactions that don\'t have them. Continue?')) {
      return
    }

    setMigrating(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/create-installments', {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('Migration failed')
      }

      const data = await res.json()
      setResult(data)
      toast.success(data.message || 'Migration completed successfully')
    } catch (err: any) {
      toast.error(err.message || 'Failed to migrate installments')
      setResult({ error: err.message })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Data Maintenance</h2>
        <p className="text-sm text-slate-600">
          Administrative tools for database maintenance and migrations
        </p>
      </div>

      <div className="border-t pt-6 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 mb-1">Migrate Installment Plans</h3>
              <p className="text-sm text-slate-600 mb-3">
                Convert existing temporary installment plans to database records. This will create installment 
                tracking for all service transactions that were created before the installment tracking system was enabled.
              </p>
              
              <button
                onClick={migrateInstallments}
                disabled={migrating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold rounded-lg transition-colors text-sm"
              >
                {migrating ? 'Migrating...' : 'Run Migration'}
              </button>

              {result && (
                <div className={`mt-4 p-3 rounded-lg ${result.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                  <div className="flex items-start gap-2">
                    {result.error ? (
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      {result.error ? (
                        <p className="text-sm text-red-800 font-medium">{result.error}</p>
                      ) : (
                        <>
                          <p className="text-sm text-green-800 font-medium mb-2">{result.message}</p>
                          {result.created !== undefined && (
                            <div className="text-xs text-green-700 space-y-1">
                              <p>✓ Created: {result.created} installments</p>
                              <p>✓ Skipped: {result.skipped} (already had installments)</p>
                              <p>✓ Total transactions processed: {result.total}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 mb-1">Important Notes</h3>
              <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                <li>Migration is safe to run multiple times - it will skip existing records</li>
                <li>New service transactions automatically create installment records</li>
                <li>Migration uses loan term data and accounts for deposits when available</li>
                <li>Temporary installment displays will be replaced with database records after migration</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

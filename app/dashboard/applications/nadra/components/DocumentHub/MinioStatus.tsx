'use client'

/**
 * MinIO Connection Status Component
 * Displays real-time connection status with ping information
 * Shows connection indicator, latency, and refresh button
 * 
 * @component
 */

import React, { useState } from 'react'
import { useMinioConnection } from '@/app/hooks/useMinioConnection'
import { CheckCircle2, AlertCircle, RefreshCw, Loader } from 'lucide-react'

export interface MinioStatusProps {
  /**
   * Interval in ms for automatic polling (default: 300000 / 5 minutes)
   * Conservative default to avoid exceeding Vercel API limits
   */
  pollInterval?: number

  /**
   * Callback when connection status changes
   */
  onStatusChange?: (connected: boolean) => void

  /**
   * Show full details or compact view
   */
  compact?: boolean

  /**
   * Custom CSS class
   */
  className?: string
}

/**
 * MinioStatus Component
 * Provides visual feedback on MinIO server connectivity
 */
export function MinioStatus({
  pollInterval = 300000,
  onStatusChange,
  compact = false,
  className = '',
}: MinioStatusProps) {
  const { status, loading, error, connected, ping, refresh } = useMinioConnection(
    pollInterval,
    true
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const endpointLabel = 'EU server 49v2'

  // Notify parent of status changes
  React.useEffect(() => {
    if (onStatusChange && status) {
      onStatusChange(status.connected)
    }
  }, [status?.connected, onStatusChange, status])

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Loading state
  if (!status && loading) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 ${className}`}
      >
        <Loader className="w-4 h-4 text-slate-500 animate-spin" />
        <span className="text-sm text-slate-600">Checking File Server...</span>
      </div>
    )
  }

  // Compact view
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {connected ? (
          <>
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-xs text-slate-600">EU server 49v2 Connected</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-xs text-slate-600">EU server 49v2 Offline</span>
          </>
        )}
      </div>
    )
  }

  // Full view
  return (
    <div
      className={`border rounded-lg p-4 bg-white ${
        connected ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Status Info */}
        <div className="flex items-start gap-3 flex-1">
          {connected ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            {/* Status Title */}
            <h3 className="font-semibold text-slate-800">
              {connected ? 'Document Storage Connected' : 'Document Storage Offline'}
            </h3>

            {/* Status Details */}
            <div className="mt-1 space-y-1 text-sm text-slate-600">
              {status?.endpoint && (
                <p>
                  <span className="font-medium">Endpoint:</span> {endpointLabel} ({status.endpoint})
                </p>
              )}

              {connected && ping !== null && (
                <p>
                  <span className="font-medium">Latency:</span> {ping}ms
                </p>
              )}

              {error && (
                <p className="text-red-600">
                  <span className="font-medium">Error:</span> {error}
                </p>
              )}

              <p className="text-xs text-slate-500">
                Last checked: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          className="flex-shrink-0 p-2 rounded-md text-slate-600 hover:bg-white hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh status"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Status Badge */}
      <div className="mt-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            connected
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-600' : 'bg-red-600'}`} />
          {connected ? 'Ready' : 'Unavailable'}
        </span>
      </div>
    </div>
  )
}

export default MinioStatus

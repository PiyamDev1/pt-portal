import { getDeviceInfo } from './utils'

interface ActiveDevicesSectionProps {
  sessions: any[]
  loading: boolean
  sessionsLoading: boolean
  sessionsError: string | null
  onSignOutAll: () => void
  onRevokeSession: (sessionId: string) => void
}

export function ActiveDevicesSection({
  sessions,
  loading,
  sessionsLoading,
  sessionsError,
  onSignOutAll,
  onRevokeSession
}: ActiveDevicesSectionProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>📱</span> Active Devices & Session History
        </h3>
        {sessions.filter(s => s.is_active).length > 1 && !sessionsLoading && !sessionsError && (
          <button
            onClick={onSignOutAll}
            disabled={loading}
            className="text-xs font-bold text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition"
          >
            Sign Out All Devices
          </button>
        )}
      </div>

      <div className="space-y-3">
        {sessionsLoading && (
          <p className="text-sm text-slate-500 italic">Fetching device list...</p>
        )}
        {sessionsError && !sessionsLoading && (
          <p className="text-sm text-red-600">{sessionsError}</p>
        )}
        {!sessionsLoading && !sessionsError && sessions.length === 0 && (
          <p className="text-sm text-slate-500 italic">No sessions found.</p>
        )}

        {sessions.map((session) => {
          const { name, icon } = getDeviceInfo(session.user_agent)
          const isActive = session.is_active !== false
          return (
            <div key={session.id} className={`flex items-center justify-between p-3 rounded border ${
              session.is_current
                ? 'border-green-200 bg-green-50'
                : isActive
                  ? 'border-blue-100 bg-blue-50'
                  : 'border-slate-100 bg-slate-50 opacity-60'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded flex items-center justify-center text-xl ${
                  session.is_current
                    ? 'bg-green-100 text-green-600'
                    : isActive
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-slate-100 text-slate-400'
                }`}>
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {name}
                    {session.is_current && (
                      <span className="ml-2 text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full">
                        Current Device
                      </span>
                    )}
                    {!session.is_current && isActive && (
                      <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                    {!isActive && (
                      <span className="ml-2 text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                        Inactive
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span>📍 {session.ip}</span>
                    <span>•</span>
                    <span>🕒 Last used: {new Date(session.last_active).toLocaleDateString()} {new Date(session.last_active).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              {!session.is_current && isActive && (
                <button
                  onClick={() => onRevokeSession(session.id)}
                  disabled={loading}
                  className="text-xs text-slate-500 hover:text-red-600 underline px-2"
                >
                  Revoke
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!sessionsLoading && sessions.length > 0 && (
        <p className="text-xs text-slate-500 mt-4 text-center">
          Showing up to 6 most recent sessions. Sessions inactive for over 1 hour are marked as inactive.
        </p>
      )}
    </div>
  )
}

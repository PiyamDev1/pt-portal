import { getPasswordStrengthIndicator } from './utils'

interface PasswordChangeFormProps {
  loading: boolean
  currentPass: string
  newPass: string
  confirmPass: string
  username?: string
  onCurrentPassChange: (value: string) => void
  onNewPassChange: (value: string) => void
  onConfirmPassChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}

export function PasswordChangeForm({
  loading,
  currentPass,
  newPass,
  confirmPass,
  username,
  onCurrentPassChange,
  onNewPassChange,
  onConfirmPassChange,
  onSubmit
}: PasswordChangeFormProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span>🔒</span> Change Password
      </h3>
      <form onSubmit={onSubmit} className="max-w-md space-y-4">
        {/* Hidden username field for password managers and accessibility */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username || ''}
          readOnly
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
          <input
            type="password" required
            autoComplete="current-password"
            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            value={currentPass}
            onChange={e => onCurrentPassChange(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
          <input
            type="password" required
            autoComplete="new-password"
            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            value={newPass}
            onChange={e => onNewPassChange(e.target.value)}
          />
          {newPass && (
            <div className="mt-2">
              <div className="flex gap-1 h-1.5 mb-1">
                {[1, 2, 3, 4, 5].map(step => (
                  <div
                    key={step}
                    className={`flex-1 rounded-full transition-all duration-300 ${
                      getPasswordStrengthIndicator(newPass).strength >= step
                        ? (getPasswordStrengthIndicator(newPass).strength < 3 ? 'bg-red-500' : 'bg-green-500')
                        : 'bg-slate-200'
                    }`}
                  ></div>
                ))}
              </div>
              <p className="text-xs text-slate-500 text-right">
                {getPasswordStrengthIndicator(newPass).strength < 3 ? 'Weak Password' : 'Strong Password'}
              </p>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
          <input
            type="password" required
            autoComplete="new-password"
            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            value={confirmPass}
            onChange={e => onConfirmPassChange(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-medium transition"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}

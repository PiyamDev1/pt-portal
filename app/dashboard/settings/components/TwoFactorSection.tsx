interface TwoFactorSectionProps {
  loading: boolean
  showCodes: string[] | null
  backupCodeCount: number
  onReset2FA: () => void
  onGenerateCodes: () => void
  onCopyCodes: () => void
  onDownloadCodes: () => void
}

export function TwoFactorSection({
  loading,
  showCodes,
  backupCodeCount,
  onReset2FA,
  onGenerateCodes,
  onCopyCodes,
  onDownloadCodes
}: TwoFactorSectionProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
        Two-Factor Authentication
      </h3>

      <div className="flex items-start gap-4">
        <div className="bg-green-50 text-green-700 p-4 rounded-lg border border-green-100 flex-1">
          <p className="font-bold">Status: Active</p>
          <p className="text-sm mt-1">Your account is secured with Google Authenticator.</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-slate-600 mb-3">Lost your phone or need to re-configure?</p>
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={onReset2FA}
            disabled={loading}
            className="border border-red-200 text-red-600 bg-red-50 px-4 py-2 rounded hover:bg-red-100 font-medium transition text-sm"
          >
            Re-install 2FA Keys
          </button>
          <button
            onClick={onGenerateCodes}
            disabled={loading}
            className="border border-slate-200 text-slate-700 bg-white px-4 py-2 rounded hover:bg-slate-50 font-medium transition text-sm"
          >
            Generate Backup Codes
          </button>
        </div>

        {!showCodes && backupCodeCount > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            <p><strong>Remaining backup codes:</strong> {backupCodeCount} unused</p>
          </div>
        )}

        {showCodes && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-100 rounded">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold">Backup codes (save these now — shown only once):</p>
              <div className="flex gap-2">
                <button type="button" onClick={onCopyCodes} className="text-xs bg-white border border-yellow-200 px-2 py-1 rounded hover:bg-yellow-100 transition">📋 Copy</button>
                <button type="button" onClick={onDownloadCodes} className="text-xs bg-white border border-yellow-200 px-3 py-1.5 rounded hover:bg-yellow-100 transition">⬇️ Download</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {showCodes.map((c, idx) => (
                <div key={idx} className="font-mono text-sm bg-white p-2 rounded border select-all">{c}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

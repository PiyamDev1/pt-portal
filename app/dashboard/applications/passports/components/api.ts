type ApiResponse<T = any> = {
  ok: boolean
  data?: T
  error?: string
}

export async function apiRequest<T = any>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    })

    if (res.ok) {
      const data = await res.json().catch(() => null)
      return { ok: true, data }
    }

    const errorData = await res.json().catch(() => null)
    return {
      ok: false,
      error: errorData?.error || errorData?.details || `Request failed (${res.status})`,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' }
  }
}

export const pakPassportApi = {
  addApplication: (data: any) =>
    apiRequest('/api/passports/pak/add-application', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRecord: (id: string, data: any, userId: string | number) =>
    apiRequest('/api/passports/pak/manage-record', {
      method: 'POST',
      body: JSON.stringify({ action: 'update', id, data, userId }),
    }),

  deleteRecord: (id: string, authCode: string, userId: string | number) =>
    apiRequest('/api/passports/pak/manage-record', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id, authCode, userId }),
    }),

  updateStatus: (passportId: string, status: string, userId: string | number, extraData?: { newPassportNo?: string; oldPassportReturned?: boolean }) =>
    apiRequest('/api/passports/pak/update-status', {
      method: 'POST',
      body: JSON.stringify({ passportId, status, userId, ...extraData }),
    }),

  updateCustody: (passportId: string, action: string, userId: string | number, newNumber?: string) =>
    apiRequest('/api/passports/pak/update-custody', {
      method: 'POST',
      body: JSON.stringify({ passportId, action, userId, newNumber }),
    }),

  getStatusHistory: async (applicationId: string) => {
    const res = await apiRequest(`/api/passports/pak/status-history?applicationId=${applicationId}`)
    return res.ok ? res.data : null
  },
}

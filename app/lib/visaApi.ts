// API calls for visa applications
export async function loadVisaMetadata() {
  try {
    const res = await fetch('/api/visas/metadata')
    const data = await res.json()
    return data
  } catch (err) {
    console.error('Metadata Load Error', err)
    throw err
  }
}

export async function saveVisaApplication(payload: any) {
  try {
    const res = await fetch('/api/visas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const result = await res.json()
    
    if (!res.ok) {
      throw new Error(result.error || 'Failed to save')
    }
    
    return result
  } catch (err: any) {
    console.error('Save Error', err)
    throw new Error(err.message || 'Failed to save application')
  }
}

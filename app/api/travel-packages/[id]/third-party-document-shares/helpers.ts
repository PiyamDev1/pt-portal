export function isThirdPartyShareSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '42P10' ||
    code === '42501' ||
    code === 'PGRST200' ||
    code === 'PGRST204'
  )
}

export function selectThirdPartyShareColumns() {
  return `
    id,
    package_id,
    created_by,
    updated_by,
    label,
    recipient_name,
    purpose,
    status,
    access_code_hint,
    allowed_categories,
    expires_at,
    terms_text,
    terms_accepted_at,
    terms_accepted_by,
    last_accessed_at,
    last_access_ip_hash,
    failed_access_count,
    last_failed_at,
    revoked_at,
    revoked_by,
    metadata,
    created_at,
    updated_at
  `
}

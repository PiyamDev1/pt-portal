/**
 * Auth & Security Types
 * Centralized type definitions for authentication and session management
 */

export interface DeviceSession {
  id: string
  user_id: string
  device_name: string
  user_agent: string
  ip_address: string
  last_activity: string
  created_at: string
  is_current: boolean
}

export interface SecuritySessionState {
  sessions: DeviceSession[]
  loading: boolean
  error: string | null
  backupCodeCount: number
}

export interface AuthUser {
  id: string
  email: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
  }
}

export interface BackupCodesResponse {
  count: number
  codes?: string[]
}

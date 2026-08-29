import type { Database as GeneratedDatabase, Json } from './supabase.generated'

export type { Json } from './supabase.generated'

type GeneratedTables = GeneratedDatabase['public']['Tables']

// `supabase.generated.ts` is the last linked-project snapshot. These additions
// describe committed migrations that can legitimately lead the deployed schema
// until `npm run types:supabase` is run after migration rollout.
type PendingMigrationTables = {
  api_rate_limit_buckets: {
    Row: {
      identity_hash: string
      request_count: number
      scope: string
      updated_at: string
      window_started_at: string
    }
    Insert: {
      identity_hash: string
      request_count?: number
      scope: string
      updated_at?: string
      window_started_at?: string
    }
    Update: {
      identity_hash?: string
      request_count?: number
      scope?: string
      updated_at?: string
      window_started_at?: string
    }
    Relationships: []
  }
  portal_schema_versions: {
    Row: {
      applied_at: string
      component: string
      details: Json
      version: number
    }
    Insert: {
      applied_at?: string
      component: string
      details?: Json
      version: number
    }
    Update: {
      applied_at?: string
      component?: string
      details?: Json
      version?: number
    }
    Relationships: []
  }
  employee_commission_assignments: {
    Row: GeneratedTables['employee_commission_assignments']['Row'] & {
      profile_id: string | null
    }
    Insert: GeneratedTables['employee_commission_assignments']['Insert'] & {
      profile_id?: string | null
    }
    Update: GeneratedTables['employee_commission_assignments']['Update'] & {
      profile_id?: string | null
    }
    Relationships: GeneratedTables['employee_commission_assignments']['Relationships']
  }
  commission_rules: {
    Row: GeneratedTables['commission_rules']['Row'] & {
      profile_id: string | null
    }
    Insert: GeneratedTables['commission_rules']['Insert'] & {
      profile_id?: string | null
    }
    Update: GeneratedTables['commission_rules']['Update'] & {
      profile_id?: string | null
    }
    Relationships: GeneratedTables['commission_rules']['Relationships']
  }
  employee_commission_profiles: {
    Row: {
      id: string
      employee_id: string
      label: string
      effective_from: string
      effective_to: string | null
      location_id: string | null
      copied_from_profile_id: string | null
      configuration: Json
      change_reason: string
      created_by: string
      created_at: string
      cancelled_at: string | null
      cancelled_by: string | null
      cancellation_reason: string | null
    }
    Insert: {
      id?: string
      employee_id: string
      label: string
      effective_from: string
      effective_to?: string | null
      location_id?: string | null
      copied_from_profile_id?: string | null
      configuration: Json
      change_reason: string
      created_by: string
      created_at?: string
      cancelled_at?: string | null
      cancelled_by?: string | null
      cancellation_reason?: string | null
    }
    Update: {
      effective_to?: string | null
    }
    Relationships: []
  }
}

type PendingMigrationFunctions = {
  check_api_rate_limit: {
    Args: {
      p_identity_hash: string
      p_limit: number
      p_scope: string
      p_window_seconds: number
    }
    Returns: {
      allowed: boolean
      remaining: number
      retry_after_seconds: number
    }[]
  }
  lms_add_fee: {
    Args: {
      p_actor_id: string
      p_amount: number
      p_customer_id: string | null
      p_idempotency_key?: string | null
      p_loan_id: string | null
      p_remark?: string | null
      p_transaction_timestamp?: string
    }
    Returns: Json
  }
  lms_add_service: {
    Args: {
      p_actor_id: string
      p_customer_id: string
      p_idempotency_key?: string | null
      p_initial_deposit?: number
      p_installment_plan?: Json | null
      p_next_due_date?: string
      p_remark?: string | null
      p_service_amount: number
      p_term_months?: number
      p_transaction_timestamp?: string
    }
    Returns: Json
  }
  lms_create_customer: {
    Args: {
      p_actor_id: string
      p_address?: string | null
      p_email?: string | null
      p_first_name: string
      p_idempotency_key?: string | null
      p_initial_transaction?: Json | null
      p_last_name: string
      p_phone?: string | null
    }
    Returns: Json
  }
  lms_schema_status: { Args: never; Returns: Json }
  lms_update_customer: {
    Args: {
      p_actor_id: string
      p_customer_id: string
      p_note?: string | null
      p_updates?: Json
    }
    Returns: Json
  }
  lms_update_installments: {
    Args: { p_installments: Json }
    Returns: Json
  }
  replace_backup_codes: {
    Args: { p_code_hashes: Json; p_user_id: string }
    Returns: number
  }
  commission_create_employee_profile_2026082904: {
    Args: {
      p_actor_employee_id: string
      p_employee_id: string
      p_label: string
      p_effective_from: string
      p_location_id: string | null
      p_copied_from_profile_id: string | null
      p_configuration: Json
      p_change_reason: string
      p_request_key: string
    }
    Returns: Json
  }
  commission_cancel_employee_profile_2026082904: {
    Args: {
      p_actor_employee_id: string
      p_profile_id: string
      p_reason: string
      p_request_key: string
    }
    Returns: Json
  }
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Tables' | 'Functions'> & {
    Tables: Omit<GeneratedDatabase['public']['Tables'], keyof PendingMigrationTables> &
      PendingMigrationTables
    Functions: Omit<GeneratedDatabase['public']['Functions'], keyof PendingMigrationFunctions> &
      PendingMigrationFunctions
  }
}

// The generated snapshot plus pending overlay define the current names. This
// compatibility view keeps those names while older routes are incrementally
// migrated away from untyped JSON payloads and handwritten row interfaces.
type LegacyRecord = Record<string, any>

type LegacyTable = {
  Row: LegacyRecord
  Insert: LegacyRecord
  Update: LegacyRecord
  Relationships: []
}

type LegacyFunction = {
  Args: LegacyRecord
  Returns: any
}

export type LegacyDatabase = {
  public: {
    Tables: {
      [Name in keyof Database['public']['Tables']]: LegacyTable
    }
    Views: {
      [Name in keyof Database['public']['Views']]: LegacyTable
    }
    Functions: {
      [Name in keyof Database['public']['Functions']]: LegacyFunction
    }
  }
}

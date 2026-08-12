import type { Database as GeneratedDatabase, Json } from './supabase.generated'

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
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Tables' | 'Functions'> & {
    Tables: GeneratedDatabase['public']['Tables'] & PendingMigrationTables
    Functions: GeneratedDatabase['public']['Functions'] & PendingMigrationFunctions
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

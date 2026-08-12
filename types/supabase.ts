import type { Database } from './supabase.generated'

// The generated schema is authoritative. This compatibility view retains its
// table/function names while older routes are incrementally migrated away from
// untyped JSON payloads and handwritten row interfaces.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LegacyRecord = Record<string, any>

type LegacyTable = {
  Row: LegacyRecord
  Insert: LegacyRecord
  Update: LegacyRecord
  Relationships: []
}

type LegacyFunction = {
  Args: LegacyRecord
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

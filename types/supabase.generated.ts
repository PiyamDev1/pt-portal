export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      accounting_categories: {
        Row: {
          id: string
          name: string
          type: Database['public']['Enums']['transaction_type_category']
        }
        Insert: {
          id?: string
          name: string
          type: Database['public']['Enums']['transaction_type_category']
        }
        Update: {
          id?: string
          name?: string
          type?: Database['public']['Enums']['transaction_type_category']
        }
        Relationships: []
      }
      airlines: {
        Row: {
          created_at: string
          iata_code: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          iata_code: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          iata_code?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      applicants: {
        Row: {
          account_type: Database['public']['Enums']['applicant_account_type']
          citizen_number: string | null
          created_at: string
          date_of_birth: string | null
          dob: string | null
          email: string | null
          first_name: string | null
          id: string
          is_new_born: boolean | null
          last_name: string | null
          passport_number: string | null
          phone_number: string | null
          referred_by_applicant_id: string | null
        }
        Insert: {
          account_type?: Database['public']['Enums']['applicant_account_type']
          citizen_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          dob?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_new_born?: boolean | null
          last_name?: string | null
          passport_number?: string | null
          phone_number?: string | null
          referred_by_applicant_id?: string | null
        }
        Update: {
          account_type?: Database['public']['Enums']['applicant_account_type']
          citizen_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          dob?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_new_born?: boolean | null
          last_name?: string | null
          passport_number?: string | null
          phone_number?: string | null
          referred_by_applicant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'applicants_referred_by_applicant_id_fkey'
            columns: ['referred_by_applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
        ]
      }
      application_note_reads: {
        Row: {
          context: string
          id: number
          note_signature: string
          record_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context: string
          id?: number
          note_signature: string
          record_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string
          id?: number
          note_signature?: string
          record_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          applicant_id: string
          created_at: string
          family_head_id: string
          has_documents: boolean
          id: string
          status: Database['public']['Enums']['application_status']
          submitted_by_employee_id: string
          tracking_number: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          family_head_id: string
          has_documents?: boolean
          id?: string
          status?: Database['public']['Enums']['application_status']
          submitted_by_employee_id: string
          tracking_number: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          family_head_id?: string
          has_documents?: boolean
          id?: string
          status?: Database['public']['Enums']['application_status']
          submitted_by_employee_id?: string
          tracking_number?: string
        }
        Relationships: [
          {
            foreignKeyName: 'applications_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'applications_family_head_id_fkey'
            columns: ['family_head_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'applications_submitted_by_employee_id_fkey'
            columns: ['submitted_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      attendance_records: {
        Row: {
          actual_work_minutes: number
          created_at: string
          employee_id: string
          id: string
          is_approved: boolean | null
          is_break_paid: boolean | null
          location_id: string | null
          machine_notes: string | null
          record_source_status: Database['public']['Enums']['attendance_source_status']
          time_in: string | null
          time_out: string | null
          total_break_minutes: number | null
          total_minutes_worked: number
          work_date: string
        }
        Insert: {
          actual_work_minutes: number
          created_at?: string
          employee_id: string
          id?: string
          is_approved?: boolean | null
          is_break_paid?: boolean | null
          location_id?: string | null
          machine_notes?: string | null
          record_source_status: Database['public']['Enums']['attendance_source_status']
          time_in?: string | null
          time_out?: string | null
          total_break_minutes?: number | null
          total_minutes_worked: number
          work_date: string
        }
        Update: {
          actual_work_minutes?: number
          created_at?: string
          employee_id?: string
          id?: string
          is_approved?: boolean | null
          is_break_paid?: boolean | null
          location_id?: string | null
          machine_notes?: string | null
          record_source_status?: Database['public']['Enums']['attendance_source_status']
          time_in?: string | null
          time_out?: string | null
          total_break_minutes?: number | null
          total_minutes_worked?: number
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_records_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attendance_records_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'audit_logs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      auth_security_events: {
        Row: {
          created_at: string
          email: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_codes: {
        Row: {
          code_hash: string
          created_at: string | null
          employee_id: string
          id: string
          used: boolean | null
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          employee_id: string
          id?: string
          used?: boolean | null
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          employee_id?: string
          id?: string
          used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: 'backup_codes_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      booking_audit_logs: {
        Row: {
          action_type: string
          actor_identifier: string | null
          after_data: Json | null
          before_data: Json | null
          booking_id: string
          created_at: string
          id: string
          location_id: string
          metadata: Json | null
        }
        Insert: {
          action_type: string
          actor_identifier?: string | null
          after_data?: Json | null
          before_data?: Json | null
          booking_id: string
          created_at?: string
          id?: string
          location_id: string
          metadata?: Json | null
        }
        Update: {
          action_type?: string
          actor_identifier?: string | null
          after_data?: Json | null
          before_data?: Json | null
          booking_id?: string
          created_at?: string
          id?: string
          location_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'booking_audit_logs_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_audit_logs_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_capacity_reservations: {
        Row: {
          booking_id: string
          created_at: string | null
          location_id: string
          occupied_until: string
          released_at: string | null
          seat_number: number
          start_time: string
          updated_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          location_id: string
          occupied_until: string
          released_at?: string | null
          seat_number: number
          start_time: string
          updated_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          location_id?: string
          occupied_until?: string
          released_at?: string | null
          seat_number?: number
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'booking_capacity_reservations_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: true
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_capacity_reservations_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_contact_flags: {
        Row: {
          blocked_until: string | null
          created_at: string
          customer_email_norm: string | null
          customer_phone_norm: string | null
          id: string
          last_missed_booking_id: string | null
          last_no_show_at: string | null
          location_id: string
          manual_review_required: boolean
          missed_count: number
          notes: string | null
          penalty_applied: boolean
          penalty_applied_at: string | null
          penalty_reason: string | null
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          customer_email_norm?: string | null
          customer_phone_norm?: string | null
          id?: string
          last_missed_booking_id?: string | null
          last_no_show_at?: string | null
          location_id: string
          manual_review_required?: boolean
          missed_count?: number
          notes?: string | null
          penalty_applied?: boolean
          penalty_applied_at?: string | null
          penalty_reason?: string | null
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          customer_email_norm?: string | null
          customer_phone_norm?: string | null
          id?: string
          last_missed_booking_id?: string | null
          last_no_show_at?: string | null
          location_id?: string
          manual_review_required?: boolean
          missed_count?: number
          notes?: string | null
          penalty_applied?: boolean
          penalty_applied_at?: string | null
          penalty_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booking_contact_flags_last_missed_booking_id_fkey'
            columns: ['last_missed_booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_contact_flags_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_drafts: {
        Row: {
          created_at: string | null
          draft_key: string
          id: string
          location_id: string | null
          payload: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          draft_key?: string
          id?: string
          location_id?: string | null
          payload?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          draft_key?: string
          id?: string
          location_id?: string | null
          payload?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booking_drafts_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_email_logs: {
        Row: {
          booking_id: string
          created_at: string | null
          customer_email: string
          email_kind: string
          email_subject: string
          failure_reason: string | null
          id: string
          location_id: string | null
          metadata: Json
          sender_email: string
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          customer_email: string
          email_kind: string
          email_subject: string
          failure_reason?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          sender_email: string
          status: string
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          customer_email?: string
          email_kind?: string
          email_subject?: string
          failure_reason?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          sender_email?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booking_email_logs_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_email_logs_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_idempotency_keys: {
        Row: {
          action_name: string
          booking_id: string | null
          created_at: string | null
          id: string
          idempotency_key: string
          location_id: string | null
          metadata: Json
          response_code: number
        }
        Insert: {
          action_name: string
          booking_id?: string | null
          created_at?: string | null
          id?: string
          idempotency_key: string
          location_id?: string | null
          metadata?: Json
          response_code?: number
        }
        Update: {
          action_name?: string
          booking_id?: string | null
          created_at?: string | null
          id?: string
          idempotency_key?: string
          location_id?: string | null
          metadata?: Json
          response_code?: number
        }
        Relationships: [
          {
            foreignKeyName: 'booking_idempotency_keys_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_idempotency_keys_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_reminder_events: {
        Row: {
          booking_id: string
          confirmation_source: string | null
          created_at: string
          id: string
          location_id: string
          metadata: Json | null
          reminder_hours_before: number | null
          reminder_sent_at: string | null
          responded_at: string | null
          response_status: string
          response_token: string | null
          same_day_reminder_hours_before: number | null
          same_day_reminder_sent_at: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          confirmation_source?: string | null
          created_at?: string
          id?: string
          location_id: string
          metadata?: Json | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          responded_at?: string | null
          response_status?: string
          response_token?: string | null
          same_day_reminder_hours_before?: number | null
          same_day_reminder_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          confirmation_source?: string | null
          created_at?: string
          id?: string
          location_id?: string
          metadata?: Json | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          responded_at?: string | null
          response_status?: string
          response_token?: string | null
          same_day_reminder_hours_before?: number | null
          same_day_reminder_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booking_reminder_events_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: true
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_reminder_events_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_reminder_settings: {
        Row: {
          attendance_confirmation_required: boolean
          created_at: string
          location_id: string
          penalty_action: string
          penalty_enabled: boolean
          penalty_note: string | null
          penalty_threshold: number
          reminder_hours_before: number
          reminder_subject: string
          reminder_template: string
          reminders_enabled: boolean
          same_day_reminder_enabled: boolean
          same_day_reminder_hours_before: number
          updated_at: string
        }
        Insert: {
          attendance_confirmation_required?: boolean
          created_at?: string
          location_id: string
          penalty_action?: string
          penalty_enabled?: boolean
          penalty_note?: string | null
          penalty_threshold?: number
          reminder_hours_before?: number
          reminder_subject?: string
          reminder_template?: string
          reminders_enabled?: boolean
          same_day_reminder_enabled?: boolean
          same_day_reminder_hours_before?: number
          updated_at?: string
        }
        Update: {
          attendance_confirmation_required?: boolean
          created_at?: string
          location_id?: string
          penalty_action?: string
          penalty_enabled?: boolean
          penalty_note?: string | null
          penalty_threshold?: number
          reminder_hours_before?: number
          reminder_subject?: string
          reminder_template?: string
          reminders_enabled?: boolean
          same_day_reminder_enabled?: boolean
          same_day_reminder_hours_before?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booking_reminder_settings_location_id_fkey'
            columns: ['location_id']
            isOneToOne: true
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_services: {
        Row: {
          available_days: number[] | null
          buffer_minutes: number
          cancellation_template: string | null
          close_overrun_tolerance_minutes: number
          confirmation_template: string | null
          created_at: string | null
          duration_minutes: number
          duration_per_additional_person_minutes: number
          id: string
          is_active: boolean
          location_id: string | null
          modification_template: string | null
          name: string
          person_count_excludes_family_head: boolean
          service_end_time: string | null
          service_start_time: string | null
          slot_interval_minutes: number | null
        }
        Insert: {
          available_days?: number[] | null
          buffer_minutes?: number
          cancellation_template?: string | null
          close_overrun_tolerance_minutes?: number
          confirmation_template?: string | null
          created_at?: string | null
          duration_minutes: number
          duration_per_additional_person_minutes?: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          modification_template?: string | null
          name: string
          person_count_excludes_family_head?: boolean
          service_end_time?: string | null
          service_start_time?: string | null
          slot_interval_minutes?: number | null
        }
        Update: {
          available_days?: number[] | null
          buffer_minutes?: number
          cancellation_template?: string | null
          close_overrun_tolerance_minutes?: number
          confirmation_template?: string | null
          created_at?: string | null
          duration_minutes?: number
          duration_per_additional_person_minutes?: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          modification_template?: string | null
          name?: string
          person_count_excludes_family_head?: boolean
          service_end_time?: string | null
          service_start_time?: string | null
          slot_interval_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'booking_services_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_user_preferences: {
        Row: {
          created_at: string | null
          id: string
          location_id: string | null
          saved_views: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          location_id?: string | null
          saved_views?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          location_id?: string | null
          saved_views?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booking_user_preferences_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      booking_waitlist_entries: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          linked_booking_id: string | null
          location_id: string
          metadata: Json
          notes: string | null
          person_count: number
          preferred_date: string | null
          preferred_time_end: string | null
          preferred_time_start: string | null
          service_id: string | null
          source: Database['public']['Enums']['booking_source']
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          linked_booking_id?: string | null
          location_id: string
          metadata?: Json
          notes?: string | null
          person_count?: number
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          service_id?: string | null
          source?: Database['public']['Enums']['booking_source']
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          linked_booking_id?: string | null
          location_id?: string
          metadata?: Json
          notes?: string | null
          person_count?: number
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          service_id?: string | null
          source?: Database['public']['Enums']['booking_source']
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'booking_waitlist_entries_linked_booking_id_fkey'
            columns: ['linked_booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_waitlist_entries_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_waitlist_entries_service_id_fkey'
            columns: ['service_id']
            isOneToOne: false
            referencedRelation: 'booking_services'
            referencedColumns: ['id']
          },
        ]
      }
      bookings: {
        Row: {
          attendance_status: string
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          end_time: string
          id: string
          last_email_error: string | null
          last_email_kind: string | null
          last_email_recipient: string | null
          last_email_sent_at: string | null
          last_email_status: string | null
          last_email_subject: string | null
          last_rescheduled_at: string | null
          location_id: string | null
          manual_override: boolean
          notes: string | null
          person_count: number
          reschedule_count: number
          service_id: string
          source: Database['public']['Enums']['booking_source']
          start_time: string
          status: Database['public']['Enums']['booking_status']
          tags: string[]
          updated_at: string | null
        }
        Insert: {
          attendance_status?: string
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          end_time: string
          id?: string
          last_email_error?: string | null
          last_email_kind?: string | null
          last_email_recipient?: string | null
          last_email_sent_at?: string | null
          last_email_status?: string | null
          last_email_subject?: string | null
          last_rescheduled_at?: string | null
          location_id?: string | null
          manual_override?: boolean
          notes?: string | null
          person_count?: number
          reschedule_count?: number
          service_id: string
          source?: Database['public']['Enums']['booking_source']
          start_time: string
          status?: Database['public']['Enums']['booking_status']
          tags?: string[]
          updated_at?: string | null
        }
        Update: {
          attendance_status?: string
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          end_time?: string
          id?: string
          last_email_error?: string | null
          last_email_kind?: string | null
          last_email_recipient?: string | null
          last_email_sent_at?: string | null
          last_email_status?: string | null
          last_email_subject?: string | null
          last_rescheduled_at?: string | null
          location_id?: string | null
          manual_override?: boolean
          notes?: string | null
          person_count?: number
          reschedule_count?: number
          service_id?: string
          source?: Database['public']['Enums']['booking_source']
          start_time?: string
          status?: Database['public']['Enums']['booking_status']
          tags?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bookings_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bookings_service_id_fkey'
            columns: ['service_id']
            isOneToOne: false
            referencedRelation: 'booking_services'
            referencedColumns: ['id']
          },
        ]
      }
      branch_schedule_overrides: {
        Row: {
          close_time: string | null
          concurrent_staff: number
          date: string
          id: string
          is_closed: boolean
          location_id: string
          lunch_end_time: string | null
          lunch_start_time: string | null
          notes: string | null
          open_time: string | null
          prayer_end_time: string | null
          prayer_start_time: string | null
          slot_interval_minutes: number
        }
        Insert: {
          close_time?: string | null
          concurrent_staff?: number
          date: string
          id?: string
          is_closed?: boolean
          location_id: string
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          notes?: string | null
          open_time?: string | null
          prayer_end_time?: string | null
          prayer_start_time?: string | null
          slot_interval_minutes?: number
        }
        Update: {
          close_time?: string | null
          concurrent_staff?: number
          date?: string
          id?: string
          is_closed?: boolean
          location_id?: string
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          notes?: string | null
          open_time?: string | null
          prayer_end_time?: string | null
          prayer_start_time?: string | null
          slot_interval_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: 'branch_schedule_overrides_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      branch_settings: {
        Row: {
          close_time: string
          concurrent_staff: number
          day_of_week: number
          id: string
          is_closed: boolean
          location_id: string | null
          lunch_end_time: string | null
          lunch_start_time: string | null
          open_time: string
          prayer_end_time: string | null
          prayer_start_time: string | null
          slot_interval_minutes: number
        }
        Insert: {
          close_time: string
          concurrent_staff?: number
          day_of_week: number
          id?: string
          is_closed?: boolean
          location_id?: string | null
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          open_time: string
          prayer_end_time?: string | null
          prayer_start_time?: string | null
          slot_interval_minutes?: number
        }
        Update: {
          close_time?: string
          concurrent_staff?: number
          day_of_week?: number
          id?: string
          is_closed?: boolean
          location_id?: string | null
          lunch_end_time?: string | null
          lunch_start_time?: string | null
          open_time?: string
          prayer_end_time?: string | null
          prayer_start_time?: string | null
          slot_interval_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: 'branch_settings_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      british_passport_applications: {
        Row: {
          age_group: string
          applicant_id: string
          application_date: string
          application_id: string | null
          cost_price: number | null
          created_at: string
          employee_id: string
          id: string
          pages: string
          passport_number: string | null
          pex_number: string | null
          pricing_id: string | null
          sale_price: number | null
          service_type: string
          status: Database['public']['Enums']['application_status']
        }
        Insert: {
          age_group: string
          applicant_id: string
          application_date?: string
          application_id?: string | null
          cost_price?: number | null
          created_at?: string
          employee_id: string
          id?: string
          pages: string
          passport_number?: string | null
          pex_number?: string | null
          pricing_id?: string | null
          sale_price?: number | null
          service_type: string
          status?: Database['public']['Enums']['application_status']
        }
        Update: {
          age_group?: string
          applicant_id?: string
          application_date?: string
          application_id?: string | null
          cost_price?: number | null
          created_at?: string
          employee_id?: string
          id?: string
          pages?: string
          passport_number?: string | null
          pex_number?: string | null
          pricing_id?: string | null
          sale_price?: number | null
          service_type?: string
          status?: Database['public']['Enums']['application_status']
        }
        Relationships: [
          {
            foreignKeyName: 'british_passport_applications_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'british_passport_applications_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'british_passport_applications_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      british_passport_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          passport_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          passport_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          passport_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'british_passport_status_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'british_passport_status_history_passport_id_fkey'
            columns: ['passport_id']
            isOneToOne: false
            referencedRelation: 'british_passport_applications'
            referencedColumns: ['id']
          },
        ]
      }
      commission_rate_components: {
        Row: {
          created_at: string
          id: string
          rate_type: Database['public']['Enums']['commission_rate_type']
          rate_value: number
          recipient: Database['public']['Enums']['commission_recipient']
          rule_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rate_type: Database['public']['Enums']['commission_rate_type']
          rate_value: number
          recipient: Database['public']['Enums']['commission_recipient']
          rule_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rate_type?: Database['public']['Enums']['commission_rate_type']
          rate_value?: number
          recipient?: Database['public']['Enums']['commission_recipient']
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'commission_rate_components_rule_id_fkey'
            columns: ['rule_id']
            isOneToOne: false
            referencedRelation: 'commission_rules'
            referencedColumns: ['id']
          },
        ]
      }
      commission_rules: {
        Row: {
          applies_to_tier: boolean
          calculation_basis: Database['public']['Enums']['calculation_basis_type']
          created_at: string
          id: string
          is_active: boolean
          product_type: Database['public']['Enums']['product_type_category']
          rule_name: string
        }
        Insert: {
          applies_to_tier?: boolean
          calculation_basis: Database['public']['Enums']['calculation_basis_type']
          created_at?: string
          id?: string
          is_active?: boolean
          product_type: Database['public']['Enums']['product_type_category']
          rule_name: string
        }
        Update: {
          applies_to_tier?: boolean
          calculation_basis?: Database['public']['Enums']['calculation_basis_type']
          created_at?: string
          id?: string
          is_active?: boolean
          product_type?: Database['public']['Enums']['product_type_category']
          rule_name?: string
        }
        Relationships: []
      }
      commission_source_event_states: {
        Row: {
          attempt_count: number
          event_id: string
          last_error: string | null
          next_attempt_at: string | null
          processing_status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          event_id: string
          last_error?: string | null
          next_attempt_at?: string | null
          processing_status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          event_id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          processing_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'commission_source_event_states_event_id_fkey'
            columns: ['event_id']
            isOneToOne: true
            referencedRelation: 'commission_source_events'
            referencedColumns: ['id']
          },
        ]
      }
      commission_source_events: {
        Row: {
          contract_version: number
          created_at: string
          effective_on: string
          employee_id: string
          event_type: string
          event_version: number
          id: string
          idempotency_key: string
          location_id: string | null
          occurred_at: string
          owner_employee_id: string | null
          source_event_id: string
          source_fact_key: string
          source_module: string
          source_path: string
          source_record_id: string
          supersedes_event_id: string | null
          variables: Json
        }
        Insert: {
          contract_version?: number
          created_at?: string
          effective_on: string
          employee_id: string
          event_type: string
          event_version?: number
          id?: string
          idempotency_key: string
          location_id?: string | null
          occurred_at: string
          owner_employee_id?: string | null
          source_event_id: string
          source_fact_key: string
          source_module: string
          source_path: string
          source_record_id: string
          supersedes_event_id?: string | null
          variables: Json
        }
        Update: {
          contract_version?: number
          created_at?: string
          effective_on?: string
          employee_id?: string
          event_type?: string
          event_version?: number
          id?: string
          idempotency_key?: string
          location_id?: string | null
          occurred_at?: string
          owner_employee_id?: string | null
          source_event_id?: string
          source_fact_key?: string
          source_module?: string
          source_path?: string
          source_record_id?: string
          supersedes_event_id?: string | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'commission_source_events_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'commission_source_events_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'commission_source_events_owner_employee_id_fkey'
            columns: ['owner_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'commission_source_events_supersedes_event_id_fkey'
            columns: ['supersedes_event_id']
            isOneToOne: false
            referencedRelation: 'commission_source_events'
            referencedColumns: ['id']
          },
        ]
      }
      commission_tiers: {
        Row: {
          created_at: string
          id: string
          min_threshold: number
          rate_type: Database['public']['Enums']['commission_rate_type']
          rate_value: number
          rule_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_threshold: number
          rate_type: Database['public']['Enums']['commission_rate_type']
          rate_value: number
          rule_id: string
        }
        Update: {
          created_at?: string
          id?: string
          min_threshold?: number
          rate_type?: Database['public']['Enums']['commission_rate_type']
          rate_value?: number
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'commission_tiers_rule_id_fkey'
            columns: ['rule_id']
            isOneToOne: false
            referencedRelation: 'commission_rules'
            referencedColumns: ['id']
          },
        ]
      }
      daily_ledger_entries: {
        Row: {
          category_id: string
          created_at: string
          customer_full_name: string | null
          employee_id: string
          id: string
          remark: string | null
          source_link_id: string | null
          supplier_vendor_id: string | null
          total_amount: number
          work_date: string
        }
        Insert: {
          category_id: string
          created_at?: string
          customer_full_name?: string | null
          employee_id: string
          id?: string
          remark?: string | null
          source_link_id?: string | null
          supplier_vendor_id?: string | null
          total_amount: number
          work_date: string
        }
        Update: {
          category_id?: string
          created_at?: string
          customer_full_name?: string | null
          employee_id?: string
          id?: string
          remark?: string | null
          source_link_id?: string | null
          supplier_vendor_id?: string | null
          total_amount?: number
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: 'daily_ledger_entries_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'accounting_categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'daily_ledger_entries_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'daily_ledger_entries_supplier_vendor_id_fkey'
            columns: ['supplier_vendor_id']
            isOneToOne: false
            referencedRelation: 'supplier_vendors'
            referencedColumns: ['id']
          },
        ]
      }
      daily_payment_splits: {
        Row: {
          amount: number
          clearing_lms_transaction_id: string | null
          created_at: string
          id: string
          ledger_entry_id: string
          payment_method_id: string
          reconciliation_status: Database['public']['Enums']['reconciliation_status_type']
          transaction_type: Database['public']['Enums']['transaction_type_category']
        }
        Insert: {
          amount: number
          clearing_lms_transaction_id?: string | null
          created_at?: string
          id?: string
          ledger_entry_id: string
          payment_method_id: string
          reconciliation_status?: Database['public']['Enums']['reconciliation_status_type']
          transaction_type: Database['public']['Enums']['transaction_type_category']
        }
        Update: {
          amount?: number
          clearing_lms_transaction_id?: string | null
          created_at?: string
          id?: string
          ledger_entry_id?: string
          payment_method_id?: string
          reconciliation_status?: Database['public']['Enums']['reconciliation_status_type']
          transaction_type?: Database['public']['Enums']['transaction_type_category']
        }
        Relationships: [
          {
            foreignKeyName: 'daily_payment_splits_clearing_lms_transaction_id_fkey'
            columns: ['clearing_lms_transaction_id']
            isOneToOne: false
            referencedRelation: 'loan_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'daily_payment_splits_ledger_entry_id_fkey'
            columns: ['ledger_entry_id']
            isOneToOne: false
            referencedRelation: 'daily_ledger_entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'daily_payment_splits_payment_method_id_fkey'
            columns: ['payment_method_id']
            isOneToOne: false
            referencedRelation: 'transaction_methods'
            referencedColumns: ['id']
          },
        ]
      }
      daily_till_closeout: {
        Row: {
          approved_by_manager_id: string | null
          branch_id: string
          cash_difference: number
          created_at: string
          final_cash_counted: number
          id: string
          is_closed: boolean
          work_date: string
        }
        Insert: {
          approved_by_manager_id?: string | null
          branch_id: string
          cash_difference: number
          created_at?: string
          final_cash_counted: number
          id?: string
          is_closed?: boolean
          work_date: string
        }
        Update: {
          approved_by_manager_id?: string | null
          branch_id?: string
          cash_difference?: number
          created_at?: string
          final_cash_counted?: number
          id?: string
          is_closed?: boolean
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: 'daily_till_closeout_approved_by_manager_id_fkey'
            columns: ['approved_by_manager_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'daily_till_closeout_branch_id_fkey'
            columns: ['branch_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      dashboard_user_module_preferences: {
        Row: {
          created_at: string
          is_favorite: boolean
          last_opened_at: string | null
          module_id: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          is_favorite?: boolean
          last_opened_at?: string | null
          module_id: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          is_favorite?: boolean
          last_opened_at?: string | null
          module_id?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      deletion_logs: {
        Row: {
          auth_code_used: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_record_data: Json | null
          id: string
          record_type: string
        }
        Insert: {
          auth_code_used?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_record_data?: Json | null
          id?: string
          record_type: string
        }
        Update: {
          auth_code_used?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_record_data?: Json | null
          id?: string
          record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'deletion_logs_deleted_by_fkey'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      departments: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      document_migration_runs: {
        Row: {
          attempted: number | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          migrated: number | null
          object_key: string | null
          outcome: string
          trigger_source: string | null
        }
        Insert: {
          attempted?: number | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          migrated?: number | null
          object_key?: string | null
          outcome: string
          trigger_source?: string | null
        }
        Update: {
          attempted?: number | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          migrated?: number | null
          object_key?: string | null
          outcome?: string
          trigger_source?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string
          deleted: boolean
          family_head_id: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          minio_bucket: string
          minio_etag: string
          minio_key: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          deleted?: boolean
          family_head_id: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          minio_bucket: string
          minio_etag?: string
          minio_key: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Update: {
          category?: string
          deleted?: boolean
          family_head_id?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          minio_bucket?: string
          minio_etag?: string
          minio_key?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      employee_commission_assignments: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          rule_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          rule_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          rule_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: 'employee_commission_assignments_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employee_commission_assignments_rule_id_fkey'
            columns: ['rule_id']
            isOneToOne: false
            referencedRelation: 'commission_rules'
            referencedColumns: ['id']
          },
        ]
      }
      employee_departments: {
        Row: {
          department_id: string
          employee_id: string
          id: string
        }
        Insert: {
          department_id: string
          employee_id: string
          id?: string
        }
        Update: {
          department_id?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'employee_departments_department_id_fkey'
            columns: ['department_id']
            isOneToOne: false
            referencedRelation: 'departments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employee_departments_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      employee_leave: {
        Row: {
          approved_by_id: string | null
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type: Database['public']['Enums']['leave_type_category']
          notes: string | null
          request_status: Database['public']['Enums']['leave_request_status']
          start_date: string
        }
        Insert: {
          approved_by_id?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type: Database['public']['Enums']['leave_type_category']
          notes?: string | null
          request_status?: Database['public']['Enums']['leave_request_status']
          start_date: string
        }
        Update: {
          approved_by_id?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: Database['public']['Enums']['leave_type_category']
          notes?: string | null
          request_status?: Database['public']['Enums']['leave_request_status']
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: 'employee_leave_approved_by_id_fkey'
            columns: ['approved_by_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employee_leave_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      employee_reviews: {
        Row: {
          action_taken: string | null
          created_at: string
          employee_id: string
          id: string
          is_active: boolean
          issue_date: string | null
          resolution_date: string | null
          review_type: string
          reviewer_id: string
          summary_notes: string | null
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_active?: boolean
          issue_date?: string | null
          resolution_date?: string | null
          review_type: string
          reviewer_id: string
          summary_notes?: string | null
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          issue_date?: string | null
          resolution_date?: string | null
          review_type?: string
          reviewer_id?: string
          summary_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'employee_reviews_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employee_reviews_reviewer_id_fkey'
            columns: ['reviewer_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      employees: {
        Row: {
          department_id: string | null
          email: string | null
          full_name: string | null
          holiday_entitlement_days: number | null
          id: string
          is_active: boolean
          is_temporary_password: boolean | null
          location_id: string | null
          manager_id: string | null
          pay_rate: number | null
          role_id: string
          sick_pay_entitlement_days: number | null
          tax_code: string | null
          timecard_approver_id: string | null
          two_factor_enabled: boolean | null
          two_factor_secret: string | null
        }
        Insert: {
          department_id?: string | null
          email?: string | null
          full_name?: string | null
          holiday_entitlement_days?: number | null
          id: string
          is_active?: boolean
          is_temporary_password?: boolean | null
          location_id?: string | null
          manager_id?: string | null
          pay_rate?: number | null
          role_id: string
          sick_pay_entitlement_days?: number | null
          tax_code?: string | null
          timecard_approver_id?: string | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
        }
        Update: {
          department_id?: string | null
          email?: string | null
          full_name?: string | null
          holiday_entitlement_days?: number | null
          id?: string
          is_active?: boolean
          is_temporary_password?: boolean | null
          location_id?: string | null
          manager_id?: string | null
          pay_rate?: number | null
          role_id?: string
          sick_pay_entitlement_days?: number | null
          tax_code?: string | null
          timecard_approver_id?: string | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'employees_department_id_fkey'
            columns: ['department_id']
            isOneToOne: false
            referencedRelation: 'departments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employees_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employees_manager_id_fkey'
            columns: ['manager_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employees_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employees_timecard_approver_id_fkey'
            columns: ['timecard_approver_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      frappe_handoff_events: {
        Row: {
          client_kind: string
          created_at: string
          employee_id: string | null
          frappe_employee_id: string | null
          frappe_user_id: string | null
          id: string
          reason: string | null
          response_mode: string
          status: string
          target_path: string
          user_agent: string | null
          user_email: string | null
        }
        Insert: {
          client_kind?: string
          created_at?: string
          employee_id?: string | null
          frappe_employee_id?: string | null
          frappe_user_id?: string | null
          id?: string
          reason?: string | null
          response_mode?: string
          status: string
          target_path?: string
          user_agent?: string | null
          user_email?: string | null
        }
        Update: {
          client_kind?: string
          created_at?: string
          employee_id?: string | null
          frappe_employee_id?: string | null
          frappe_user_id?: string | null
          id?: string
          reason?: string | null
          response_mode?: string
          status?: string
          target_path?: string
          user_agent?: string | null
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'frappe_handoff_events_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      gb_passport_ages: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      gb_passport_pages: {
        Row: {
          created_at: string | null
          id: string
          option_label: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_label: string
        }
        Update: {
          created_at?: string | null
          id?: string
          option_label?: string
        }
        Relationships: []
      }
      gb_passport_pricing: {
        Row: {
          age_group: string
          cost_price: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          pages: string
          sale_price: number | null
          service_type: string
          updated_at: string | null
        }
        Insert: {
          age_group: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          pages: string
          sale_price?: number | null
          service_type: string
          updated_at?: string | null
        }
        Update: {
          age_group?: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          pages?: string
          sale_price?: number | null
          service_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      gb_passport_services: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      generated_receipts: {
        Row: {
          applicant_id: string
          application_id: string
          generated_at: string
          generated_by: string | null
          id: string
          is_shared: boolean
          payload: Json
          receipt_pin: string
          receipt_type: string
          service_record_id: string
          service_type: string
          share_count: number
          shared_at: string | null
          shared_via: string | null
          tracking_number: string | null
        }
        Insert: {
          applicant_id: string
          application_id: string
          generated_at?: string
          generated_by?: string | null
          id: string
          is_shared?: boolean
          payload: Json
          receipt_pin: string
          receipt_type: string
          service_record_id: string
          service_type: string
          share_count?: number
          shared_at?: string | null
          shared_via?: string | null
          tracking_number?: string | null
        }
        Update: {
          applicant_id?: string
          application_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_shared?: boolean
          payload?: Json
          receipt_pin?: string
          receipt_type?: string
          service_record_id?: string
          service_type?: string
          share_count?: number
          shared_at?: string | null
          shared_via?: string | null
          tracking_number?: string | null
        }
        Relationships: []
      }
      integration_conflicts: {
        Row: {
          created_at: string
          domain: string
          entity_id: string
          frappe_snapshot: Json
          id: string
          notes: string | null
          resolution_strategy: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          supabase_snapshot: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          entity_id: string
          frappe_snapshot: Json
          id?: string
          notes?: string | null
          resolution_strategy?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          supabase_snapshot: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          entity_id?: string
          frappe_snapshot?: Json
          id?: string
          notes?: string | null
          resolution_strategy?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          supabase_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'integration_conflicts_resolved_by_fkey'
            columns: ['resolved_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      integration_identity_map: {
        Row: {
          created_at: string
          domain: string
          frappe_employee_id: string | null
          frappe_user_id: string | null
          id: string
          supabase_employee_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          frappe_employee_id?: string | null
          frappe_user_id?: string | null
          id?: string
          supabase_employee_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          frappe_employee_id?: string | null
          frappe_user_id?: string | null
          id?: string
          supabase_employee_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'integration_identity_map_supabase_employee_id_fkey'
            columns: ['supabase_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      integration_inbox: {
        Row: {
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          source: string
          source_event_id: string
          status: string
          updated_at: string
        }
        Insert: {
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          source: string
          source_event_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source?: string
          source_event_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_outbox: {
        Row: {
          aggregate_id: string
          attempts: number
          created_at: string
          dedupe_key: string
          domain: string
          event_type: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          aggregate_id: string
          attempts?: number
          created_at?: string
          dedupe_key: string
          domain: string
          event_type: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Update: {
          aggregate_id?: string
          attempts?: number
          created_at?: string
          dedupe_key?: string
          domain?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_sync_state: {
        Row: {
          created_at: string
          details: Json | null
          domain: string
          health_status: string
          id: string
          last_pull_at: string | null
          last_pull_cursor: string | null
          last_push_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          domain: string
          health_status?: string
          id?: string
          last_pull_at?: string | null
          last_pull_cursor?: string | null
          last_push_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          domain?: string
          health_status?: string
          id?: string
          last_pull_at?: string | null
          last_pull_cursor?: string | null
          last_push_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      issue_report_artifacts: {
        Row: {
          artifact_type: string
          byte_size: number
          content_type: string
          created_at: string
          deleted_at: string | null
          id: string
          storage_bucket: string
          storage_key: string
          storage_provider: string
          ticket_id: string
        }
        Insert: {
          artifact_type: string
          byte_size?: number
          content_type: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          storage_bucket: string
          storage_key: string
          storage_provider: string
          ticket_id: string
        }
        Update: {
          artifact_type?: string
          byte_size?: number
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          storage_bucket?: string
          storage_key?: string
          storage_provider?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'issue_report_artifacts_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'issue_reports'
            referencedColumns: ['id']
          },
        ]
      }
      issue_report_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: number
          ticket_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: number
          ticket_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'issue_report_events_actor_user_id_fkey'
            columns: ['actor_user_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'issue_report_events_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'issue_reports'
            referencedColumns: ['id']
          },
        ]
      }
      issue_reports: {
        Row: {
          artifact_purge_after: string | null
          assigned_to_user_id: string | null
          browser_context: Json
          closed_at: string | null
          created_at: string
          has_console_log: boolean
          has_screenshot: boolean
          id: string
          last_status_changed_by: string | null
          module_key: string
          notes: string
          page_url: string
          reporter_email: string | null
          reporter_name: string | null
          reporter_user_id: string | null
          route_path: string
          severity: string
          solved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          artifact_purge_after?: string | null
          assigned_to_user_id?: string | null
          browser_context?: Json
          closed_at?: string | null
          created_at?: string
          has_console_log?: boolean
          has_screenshot?: boolean
          id?: string
          last_status_changed_by?: string | null
          module_key: string
          notes: string
          page_url: string
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_user_id?: string | null
          route_path: string
          severity?: string
          solved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          artifact_purge_after?: string | null
          assigned_to_user_id?: string | null
          browser_context?: Json
          closed_at?: string | null
          created_at?: string
          has_console_log?: boolean
          has_screenshot?: boolean
          id?: string
          last_status_changed_by?: string | null
          module_key?: string
          notes?: string
          page_url?: string
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_user_id?: string | null
          route_path?: string
          severity?: string
          solved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'issue_reports_assigned_to_user_id_fkey'
            columns: ['assigned_to_user_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'issue_reports_last_status_changed_by_fkey'
            columns: ['last_status_changed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'issue_reports_reporter_user_id_fkey'
            columns: ['reporter_user_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      leave_balances: {
        Row: {
          allocated_days: number
          balance_year: number
          created_at: string
          employee_id: string
          id: string
          leave_type_id: string
          pending_days: number
          synced_at: string | null
          updated_at: string
          used_days: number
        }
        Insert: {
          allocated_days?: number
          balance_year: number
          created_at?: string
          employee_id: string
          id?: string
          leave_type_id: string
          pending_days?: number
          synced_at?: string | null
          updated_at?: string
          used_days?: number
        }
        Update: {
          allocated_days?: number
          balance_year?: number
          created_at?: string
          employee_id?: string
          id?: string
          leave_type_id?: string
          pending_days?: number
          synced_at?: string | null
          updated_at?: string
          used_days?: number
        }
        Relationships: [
          {
            foreignKeyName: 'leave_balances_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leave_balances_leave_type_id_fkey'
            columns: ['leave_type_id']
            isOneToOne: false
            referencedRelation: 'leave_types'
            referencedColumns: ['id']
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          created_at: string
          employee_id: string
          frappe_docname: string | null
          from_date: string
          half_day: boolean
          half_day_date: string | null
          id: string
          leave_type_id: string
          override_by: string | null
          override_reason: string | null
          rejection_reason: string | null
          requested_days: number
          source_system: string
          status: string
          sync_version: number
          synced_at: string | null
          to_date: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string
          employee_id: string
          frappe_docname?: string | null
          from_date: string
          half_day?: boolean
          half_day_date?: string | null
          id?: string
          leave_type_id: string
          override_by?: string | null
          override_reason?: string | null
          rejection_reason?: string | null
          requested_days: number
          source_system?: string
          status?: string
          sync_version?: number
          synced_at?: string | null
          to_date: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string
          employee_id?: string
          frappe_docname?: string | null
          from_date?: string
          half_day?: boolean
          half_day_date?: string | null
          id?: string
          leave_type_id?: string
          override_by?: string | null
          override_reason?: string | null
          rejection_reason?: string | null
          requested_days?: number
          source_system?: string
          status?: string
          sync_version?: number
          synced_at?: string | null
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'leave_requests_approver_id_fkey'
            columns: ['approver_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leave_requests_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leave_requests_leave_type_id_fkey'
            columns: ['leave_type_id']
            isOneToOne: false
            referencedRelation: 'leave_types'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leave_requests_override_by_fkey'
            columns: ['override_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      leave_types: {
        Row: {
          code: string
          created_at: string
          default_annual_allocation: number | null
          id: string
          include_holidays: boolean
          is_paid: boolean
          max_consecutive_days: number | null
          name: string
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_annual_allocation?: number | null
          id?: string
          include_holidays?: boolean
          is_paid?: boolean
          max_consecutive_days?: number | null
          name: string
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_annual_allocation?: number | null
          id?: string
          include_holidays?: boolean
          is_paid?: boolean
          max_consecutive_days?: number | null
          name?: string
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      lms_idempotency_keys: {
        Row: {
          action_name: string
          actor_id: string
          created_at: string
          id: string
          idempotency_key: string
          request_payload: Json
          response_payload: Json
        }
        Insert: {
          action_name: string
          actor_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          request_payload?: Json
          response_payload: Json
        }
        Update: {
          action_name?: string
          actor_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          request_payload?: Json
          response_payload?: Json
        }
        Relationships: []
      }
      loan_account_notes: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          loan_customer_id: string
          note: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          loan_customer_id: string
          note: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          loan_customer_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: 'loan_account_notes_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_account_notes_loan_customer_id_fkey'
            columns: ['loan_customer_id']
            isOneToOne: false
            referencedRelation: 'loan_customers'
            referencedColumns: ['id']
          },
        ]
      }
      loan_collections_log: {
        Row: {
          action_type: Database['public']['Enums']['loan_collection_action']
          created_at: string
          employee_id: string
          id: string
          loan_id: string
          next_action_date: string | null
          notes: string | null
        }
        Insert: {
          action_type: Database['public']['Enums']['loan_collection_action']
          created_at?: string
          employee_id: string
          id?: string
          loan_id: string
          next_action_date?: string | null
          notes?: string | null
        }
        Update: {
          action_type?: Database['public']['Enums']['loan_collection_action']
          created_at?: string
          employee_id?: string
          id?: string
          loan_id?: string
          next_action_date?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'loan_collections_log_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_collections_log_loan_id_fkey'
            columns: ['loan_id']
            isOneToOne: false
            referencedRelation: 'loans'
            referencedColumns: ['id']
          },
        ]
      }
      loan_customers: {
        Row: {
          address: string | null
          applicant_id: string | null
          created_at: string
          created_by_employee_id: string | null
          date_of_birth: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          link_status: Database['public']['Enums']['loan_link_status']
          override_reason: string | null
          phone_number: string | null
          postcode: string | null
          suggested_applicant_id: string | null
        }
        Insert: {
          address?: string | null
          applicant_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          link_status?: Database['public']['Enums']['loan_link_status']
          override_reason?: string | null
          phone_number?: string | null
          postcode?: string | null
          suggested_applicant_id?: string | null
        }
        Update: {
          address?: string | null
          applicant_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          link_status?: Database['public']['Enums']['loan_link_status']
          override_reason?: string | null
          phone_number?: string | null
          postcode?: string | null
          suggested_applicant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'loan_customers_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_customers_created_by_employee_id_fkey'
            columns: ['created_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_customers_suggested_applicant_id_fkey'
            columns: ['suggested_applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
        ]
      }
      loan_installments: {
        Row: {
          amount: number
          amount_paid: number | null
          created_at: string
          due_date: string
          id: string
          installment_number: number
          loan_transaction_id: string
          status: string
        }
        Insert: {
          amount: number
          amount_paid?: number | null
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          loan_transaction_id: string
          status?: string
        }
        Update: {
          amount?: number
          amount_paid?: number | null
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          loan_transaction_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'loan_installments_loan_transaction_id_fkey'
            columns: ['loan_transaction_id']
            isOneToOne: false
            referencedRelation: 'loan_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      loan_package_links: {
        Row: {
          created_at: string
          id: string
          loan_transaction_id: string
          package_ref_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          loan_transaction_id: string
          package_ref_number: string
        }
        Update: {
          created_at?: string
          id?: string
          loan_transaction_id?: string
          package_ref_number?: string
        }
        Relationships: [
          {
            foreignKeyName: 'loan_package_links_loan_transaction_id_fkey'
            columns: ['loan_transaction_id']
            isOneToOne: false
            referencedRelation: 'loan_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      loan_payment_methods: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      loan_service_categories: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      loan_transactions: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          employee_id: string
          id: string
          installment_id: string | null
          loan_id: string
          package_ref_status: Database['public']['Enums']['pnr_validation_status']
          payer_name: string | null
          payment_method_id: string | null
          remark: string | null
          service_category_id: string | null
          service_transaction_id: string | null
          transaction_timestamp: string
          transaction_type: Database['public']['Enums']['loan_transaction_type']
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          employee_id: string
          id?: string
          installment_id?: string | null
          loan_id: string
          package_ref_status?: Database['public']['Enums']['pnr_validation_status']
          payer_name?: string | null
          payment_method_id?: string | null
          remark?: string | null
          service_category_id?: string | null
          service_transaction_id?: string | null
          transaction_timestamp?: string
          transaction_type: Database['public']['Enums']['loan_transaction_type']
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          employee_id?: string
          id?: string
          installment_id?: string | null
          loan_id?: string
          package_ref_status?: Database['public']['Enums']['pnr_validation_status']
          payer_name?: string | null
          payment_method_id?: string | null
          remark?: string | null
          service_category_id?: string | null
          service_transaction_id?: string | null
          transaction_timestamp?: string
          transaction_type?: Database['public']['Enums']['loan_transaction_type']
        }
        Relationships: [
          {
            foreignKeyName: 'loan_transactions_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_transactions_installment_id_fkey'
            columns: ['installment_id']
            isOneToOne: false
            referencedRelation: 'loan_installments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_transactions_loan_id_fkey'
            columns: ['loan_id']
            isOneToOne: false
            referencedRelation: 'loans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_transactions_payment_method_id_fkey'
            columns: ['payment_method_id']
            isOneToOne: false
            referencedRelation: 'loan_payment_methods'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_transactions_service_category_id_fkey'
            columns: ['service_category_id']
            isOneToOne: false
            referencedRelation: 'loan_service_categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_transactions_service_transaction_id_fkey'
            columns: ['service_transaction_id']
            isOneToOne: false
            referencedRelation: 'loan_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      loans: {
        Row: {
          created_at: string
          current_balance: number
          employee_id: string
          id: string
          loan_customer_id: string
          next_due_date: string | null
          status: Database['public']['Enums']['loan_status_type']
          term_months: number | null
          total_debt_amount: number
        }
        Insert: {
          created_at?: string
          current_balance: number
          employee_id: string
          id?: string
          loan_customer_id: string
          next_due_date?: string | null
          status?: Database['public']['Enums']['loan_status_type']
          term_months?: number | null
          total_debt_amount: number
        }
        Update: {
          created_at?: string
          current_balance?: number
          employee_id?: string
          id?: string
          loan_customer_id?: string
          next_due_date?: string | null
          status?: Database['public']['Enums']['loan_status_type']
          term_months?: number | null
          total_debt_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: 'loans_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loans_loan_customer_id_fkey'
            columns: ['loan_customer_id']
            isOneToOne: false
            referencedRelation: 'loan_customers'
            referencedColumns: ['id']
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          address_line1: string | null
          address_line2: string | null
          appointments_enabled: boolean
          branch_code: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          parent_location_id: string | null
          phone: string | null
          postcode: string | null
          timezone: string
          type: string | null
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          appointments_enabled?: boolean
          branch_code?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          parent_location_id?: string | null
          phone?: string | null
          postcode?: string | null
          timezone?: string
          type?: string | null
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          appointments_enabled?: boolean
          branch_code?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          parent_location_id?: string | null
          phone?: string | null
          postcode?: string | null
          timezone?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'locations_parent_location_id_fkey'
            columns: ['parent_location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      loyalty_earning_rules: {
        Row: {
          calculation_basis: Database['public']['Enums']['loyalty_calc_basis']
          created_at: string
          id: string
          product_type: Database['public']['Enums']['loyalty_product_type']
          rate_value: number
        }
        Insert: {
          calculation_basis: Database['public']['Enums']['loyalty_calc_basis']
          created_at?: string
          id?: string
          product_type: Database['public']['Enums']['loyalty_product_type']
          rate_value: number
        }
        Update: {
          calculation_basis?: Database['public']['Enums']['loyalty_calc_basis']
          created_at?: string
          id?: string
          product_type?: Database['public']['Enums']['loyalty_product_type']
          rate_value?: number
        }
        Relationships: []
      }
      loyalty_points_ledger: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          mobile_user_id: string
          points_change: number
          reason: string | null
          scan_terminal_ref: string | null
          source_ledger_id: string | null
          transaction_type: Database['public']['Enums']['loyalty_transaction_type']
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          mobile_user_id: string
          points_change: number
          reason?: string | null
          scan_terminal_ref?: string | null
          source_ledger_id?: string | null
          transaction_type: Database['public']['Enums']['loyalty_transaction_type']
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          mobile_user_id?: string
          points_change?: number
          reason?: string | null
          scan_terminal_ref?: string | null
          source_ledger_id?: string | null
          transaction_type?: Database['public']['Enums']['loyalty_transaction_type']
        }
        Relationships: [
          {
            foreignKeyName: 'loyalty_points_ledger_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loyalty_points_ledger_mobile_user_id_fkey'
            columns: ['mobile_user_id']
            isOneToOne: false
            referencedRelation: 'mobile_users'
            referencedColumns: ['id']
          },
        ]
      }
      loyalty_redeem_catalog: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          item_name: string
          points_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_name: string
          points_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_name?: string
          points_cost?: number
        }
        Relationships: []
      }
      loyalty_tiers: {
        Row: {
          created_at: string
          display_order: number
          earning_multiplier: number
          id: string
          min_points_threshold: number
          tier_name: string
        }
        Insert: {
          created_at?: string
          display_order: number
          earning_multiplier?: number
          id?: string
          min_points_threshold?: number
          tier_name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          earning_multiplier?: number
          id?: string
          min_points_threshold?: number
          tier_name?: string
        }
        Relationships: []
      }
      mobile_users: {
        Row: {
          created_at: string
          email: string
          id: string
          phone_number: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          phone_number?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          phone_number?: string | null
        }
        Relationships: []
      }
      mobile_users_profile_link: {
        Row: {
          applicant_id: string | null
          created_at: string
          id: string
          match_status: string
          mobile_user_id: string
        }
        Insert: {
          applicant_id?: string | null
          created_at?: string
          id?: string
          match_status?: string
          mobile_user_id: string
        }
        Update: {
          applicant_id?: string | null
          created_at?: string
          id?: string
          match_status?: string
          mobile_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'mobile_users_profile_link_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mobile_users_profile_link_mobile_user_id_fkey'
            columns: ['mobile_user_id']
            isOneToOne: true
            referencedRelation: 'mobile_users'
            referencedColumns: ['id']
          },
        ]
      }
      monthly_pnl_reports: {
        Row: {
          category_id: string
          compiled_by_employee_id: string | null
          created_at: string
          id: string
          in_amount: number | null
          out_amount: number | null
          report_month: string
        }
        Insert: {
          category_id: string
          compiled_by_employee_id?: string | null
          created_at?: string
          id?: string
          in_amount?: number | null
          out_amount?: number | null
          report_month: string
        }
        Update: {
          category_id?: string
          compiled_by_employee_id?: string | null
          created_at?: string
          id?: string
          in_amount?: number | null
          out_amount?: number | null
          report_month?: string
        }
        Relationships: [
          {
            foreignKeyName: 'monthly_pnl_reports_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'pnl_reporting_categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'monthly_pnl_reports_compiled_by_employee_id_fkey'
            columns: ['compiled_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      nadra_pricing: {
        Row: {
          cost_price: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          sale_price: number | null
          service_option: string | null
          service_type: string
          updated_at: string | null
        }
        Insert: {
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          sale_price?: number | null
          service_option?: string | null
          service_type: string
          updated_at?: string | null
        }
        Update: {
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          sale_price?: number | null
          service_option?: string | null
          service_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      nadra_service_options: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          service_type_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          service_type_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          service_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'nadra_service_options_service_type_id_fkey'
            columns: ['service_type_id']
            isOneToOne: false
            referencedRelation: 'nadra_service_types'
            referencedColumns: ['id']
          },
        ]
      }
      nadra_service_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      nadra_services: {
        Row: {
          applicant_id: string
          application_date: string
          application_id: string | null
          application_pin: string | null
          created_at: string
          employee_id: string
          id: string
          is_refunded: boolean
          notes: string | null
          refunded_at: string | null
          service_type: Database['public']['Enums']['nadra_service_type']
          status: Database['public']['Enums']['application_status']
          tracking_number: string | null
        }
        Insert: {
          applicant_id: string
          application_date?: string
          application_id?: string | null
          application_pin?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_refunded?: boolean
          notes?: string | null
          refunded_at?: string | null
          service_type: Database['public']['Enums']['nadra_service_type']
          status?: Database['public']['Enums']['application_status']
          tracking_number?: string | null
        }
        Update: {
          applicant_id?: string
          application_date?: string
          application_id?: string | null
          application_pin?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_refunded?: boolean
          notes?: string | null
          refunded_at?: string | null
          service_type?: Database['public']['Enums']['nadra_service_type']
          status?: Database['public']['Enums']['application_status']
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'nadra_services_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nadra_services_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nadra_services_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      nadra_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          complaint_number: string | null
          details: string | null
          entry_type: string
          id: string
          nadra_service_id: string | null
          new_status: string | null
          old_status: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          complaint_number?: string | null
          details?: string | null
          entry_type?: string
          id?: string
          nadra_service_id?: string | null
          new_status?: string | null
          old_status?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          complaint_number?: string | null
          details?: string | null
          entry_type?: string
          id?: string
          nadra_service_id?: string | null
          new_status?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'nadra_status_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nadra_status_history_nadra_service_id_fkey'
            columns: ['nadra_service_id']
            isOneToOne: false
            referencedRelation: 'nadra_services'
            referencedColumns: ['id']
          },
        ]
      }
      nicop_cnic_details: {
        Row: {
          id: string
          service_option: Database['public']['Enums']['nicop_cnic_option']
        }
        Insert: {
          id: string
          service_option: Database['public']['Enums']['nicop_cnic_option']
        }
        Update: {
          id?: string
          service_option?: Database['public']['Enums']['nicop_cnic_option']
        }
        Relationships: [
          {
            foreignKeyName: 'nicop_cnic_details_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'nadra_services'
            referencedColumns: ['id']
          },
        ]
      }
      notice_board_slide_reads: {
        Row: {
          dismissed_at: string | null
          first_seen_at: string
          last_seen_at: string
          slide_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          first_seen_at?: string
          last_seen_at?: string
          slide_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          first_seen_at?: string
          last_seen_at?: string
          slide_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notice_board_slide_reads_slide_id_fkey'
            columns: ['slide_id']
            isOneToOne: false
            referencedRelation: 'notice_board_slides'
            referencedColumns: ['id']
          },
        ]
      }
      notice_board_slides: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          display_seconds: number
          hyperlink_url: string | null
          id: string
          image_storage_bucket: string | null
          image_storage_key: string | null
          image_storage_provider: string | null
          image_url: string | null
          is_active: boolean
          sort_order: number
          target_department_id: string | null
          target_location_id: string | null
          target_role: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          display_seconds?: number
          hyperlink_url?: string | null
          id?: string
          image_storage_bucket?: string | null
          image_storage_key?: string | null
          image_storage_provider?: string | null
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          target_department_id?: string | null
          target_location_id?: string | null
          target_role?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          display_seconds?: number
          hyperlink_url?: string | null
          id?: string
          image_storage_bucket?: string | null
          image_storage_key?: string | null
          image_storage_provider?: string | null
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          target_department_id?: string | null
          target_location_id?: string | null
          target_role?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notice_board_slides_target_department_id_fkey'
            columns: ['target_department_id']
            isOneToOne: false
            referencedRelation: 'departments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notice_board_slides_target_location_id_fkey'
            columns: ['target_location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      package_components: {
        Row: {
          buy_rate: number
          component_description: string | null
          component_type: Database['public']['Enums']['package_component_type']
          created_at: string
          id: string
          linked_detail_id: string | null
          package_id: string
          sell_rate: number
          supplier_commission: number
          supplier_name: string | null
        }
        Insert: {
          buy_rate: number
          component_description?: string | null
          component_type: Database['public']['Enums']['package_component_type']
          created_at?: string
          id?: string
          linked_detail_id?: string | null
          package_id: string
          sell_rate: number
          supplier_commission?: number
          supplier_name?: string | null
        }
        Update: {
          buy_rate?: number
          component_description?: string | null
          component_type?: Database['public']['Enums']['package_component_type']
          created_at?: string
          id?: string
          linked_detail_id?: string | null
          package_id?: string
          sell_rate?: number
          supplier_commission?: number
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'package_components_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          },
        ]
      }
      package_destinations: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      package_hotel_details: {
        Row: {
          hotel_name: string
          id: string
          supplier_name: string
        }
        Insert: {
          hotel_name: string
          id: string
          supplier_name: string
        }
        Update: {
          hotel_name?: string
          id?: string
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: 'package_hotel_details_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'package_components'
            referencedColumns: ['id']
          },
        ]
      }
      packages: {
        Row: {
          created_at: string
          destination_id: string
          employee_id: string
          first_name: string
          id: string
          is_processed: boolean
          last_name: string
          package_ref_number: string
          package_type: Database['public']['Enums']['package_category']
          sale_price_total: number | null
        }
        Insert: {
          created_at?: string
          destination_id: string
          employee_id: string
          first_name: string
          id?: string
          is_processed?: boolean
          last_name: string
          package_ref_number: string
          package_type: Database['public']['Enums']['package_category']
          sale_price_total?: number | null
        }
        Update: {
          created_at?: string
          destination_id?: string
          employee_id?: string
          first_name?: string
          id?: string
          is_processed?: boolean
          last_name?: string
          package_ref_number?: string
          package_type?: Database['public']['Enums']['package_category']
          sale_price_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'packages_destination_id_fkey'
            columns: ['destination_id']
            isOneToOne: false
            referencedRelation: 'package_destinations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'packages_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      pakistani_passport_applications: {
        Row: {
          applicant_id: string
          application_date: string
          application_id: string | null
          application_type: Database['public']['Enums']['pakistani_application_type']
          biometrics_email: string | null
          category: Database['public']['Enums']['pakistani_passport_category']
          created_at: string
          employee_id: string
          family_head_email: string | null
          fingerprints_completed: boolean | null
          id: string
          is_lost: boolean
          is_old_passport_returned: boolean | null
          is_refunded: boolean
          new_passport_number: string | null
          notes: string | null
          old_passport_number: string | null
          old_passport_returned_at: string | null
          old_passport_returned_by: string | null
          page_count: string | null
          passport_number: string | null
          refunded_at: string | null
          requested_page_number: string | null
          requested_page_provided: boolean
          speed: Database['public']['Enums']['processing_speed']
          status: Database['public']['Enums']['application_status']
          tracking_number: string | null
        }
        Insert: {
          applicant_id: string
          application_date?: string
          application_id?: string | null
          application_type: Database['public']['Enums']['pakistani_application_type']
          biometrics_email?: string | null
          category: Database['public']['Enums']['pakistani_passport_category']
          created_at?: string
          employee_id: string
          family_head_email?: string | null
          fingerprints_completed?: boolean | null
          id?: string
          is_lost?: boolean
          is_old_passport_returned?: boolean | null
          is_refunded?: boolean
          new_passport_number?: string | null
          notes?: string | null
          old_passport_number?: string | null
          old_passport_returned_at?: string | null
          old_passport_returned_by?: string | null
          page_count?: string | null
          passport_number?: string | null
          refunded_at?: string | null
          requested_page_number?: string | null
          requested_page_provided?: boolean
          speed: Database['public']['Enums']['processing_speed']
          status?: Database['public']['Enums']['application_status']
          tracking_number?: string | null
        }
        Update: {
          applicant_id?: string
          application_date?: string
          application_id?: string | null
          application_type?: Database['public']['Enums']['pakistani_application_type']
          biometrics_email?: string | null
          category?: Database['public']['Enums']['pakistani_passport_category']
          created_at?: string
          employee_id?: string
          family_head_email?: string | null
          fingerprints_completed?: boolean | null
          id?: string
          is_lost?: boolean
          is_old_passport_returned?: boolean | null
          is_refunded?: boolean
          new_passport_number?: string | null
          notes?: string | null
          old_passport_number?: string | null
          old_passport_returned_at?: string | null
          old_passport_returned_by?: string | null
          page_count?: string | null
          passport_number?: string | null
          refunded_at?: string | null
          requested_page_number?: string | null
          requested_page_provided?: boolean
          speed?: Database['public']['Enums']['processing_speed']
          status?: Database['public']['Enums']['application_status']
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'pakistani_passport_applications_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_applications_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_applications_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_applications_old_passport_returned_by_fkey'
            columns: ['old_passport_returned_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      pakistani_passport_drafts: {
        Row: {
          applicant_cnic: string
          applicant_email: string | null
          applicant_id: string | null
          applicant_name: string
          applicant_phone: string | null
          application_type: string
          assigned_employee_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: string
          converted_application_id: string | null
          converted_at: string | null
          converted_by: string | null
          created_at: string
          created_by: string
          draft_id: string
          family_head_email: string
          id: string
          notes: string | null
          official_tracking_number: string | null
          old_passport_number: string | null
          page_count: string | null
          payment_amount: number | null
          payment_note: string | null
          payment_refunded_at: string | null
          payment_status: string
          sent_to_external_at: string | null
          speed: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applicant_cnic: string
          applicant_email?: string | null
          applicant_id?: string | null
          applicant_name: string
          applicant_phone?: string | null
          application_type: string
          assigned_employee_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category: string
          converted_application_id?: string | null
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          created_by: string
          draft_id: string
          family_head_email: string
          id?: string
          notes?: string | null
          official_tracking_number?: string | null
          old_passport_number?: string | null
          page_count?: string | null
          payment_amount?: number | null
          payment_note?: string | null
          payment_refunded_at?: string | null
          payment_status?: string
          sent_to_external_at?: string | null
          speed: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applicant_cnic?: string
          applicant_email?: string | null
          applicant_id?: string | null
          applicant_name?: string
          applicant_phone?: string | null
          application_type?: string
          assigned_employee_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          converted_application_id?: string | null
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          created_by?: string
          draft_id?: string
          family_head_email?: string
          id?: string
          notes?: string | null
          official_tracking_number?: string | null
          old_passport_number?: string | null
          page_count?: string | null
          payment_amount?: number | null
          payment_note?: string | null
          payment_refunded_at?: string | null
          payment_status?: string
          sent_to_external_at?: string | null
          speed?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'pakistani_passport_drafts_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_drafts_assigned_employee_id_fkey'
            columns: ['assigned_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_drafts_cancelled_by_fkey'
            columns: ['cancelled_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_drafts_converted_application_id_fkey'
            columns: ['converted_application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_drafts_converted_by_fkey'
            columns: ['converted_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_drafts_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_drafts_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      pakistani_passport_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string | null
          old_status: string | null
          passport_application_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          passport_application_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          passport_application_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'pakistani_passport_status_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pakistani_passport_status_history_passport_application_id_fkey'
            columns: ['passport_application_id']
            isOneToOne: false
            referencedRelation: 'pakistani_passport_applications'
            referencedColumns: ['id']
          },
        ]
      }
      passport_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string | null
          old_status: string | null
          passport_app_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          passport_app_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          passport_app_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'passport_status_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'passport_status_history_passport_app_id_fkey'
            columns: ['passport_app_id']
            isOneToOne: false
            referencedRelation: 'pakistani_passport_applications'
            referencedColumns: ['id']
          },
        ]
      }
      password_history: {
        Row: {
          created_at: string | null
          employee_id: string | null
          id: string
          password_hash: string
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          password_hash: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          password_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'password_history_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      payroll_deductions: {
        Row: {
          amount: number
          deduction_type: Database['public']['Enums']['deduction_type']
          id: string
          payroll_record_id: string
        }
        Insert: {
          amount: number
          deduction_type: Database['public']['Enums']['deduction_type']
          id?: string
          payroll_record_id: string
        }
        Update: {
          amount?: number
          deduction_type?: Database['public']['Enums']['deduction_type']
          id?: string
          payroll_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payroll_deductions_payroll_record_id_fkey'
            columns: ['payroll_record_id']
            isOneToOne: false
            referencedRelation: 'payroll_records'
            referencedColumns: ['id']
          },
        ]
      }
      payroll_records: {
        Row: {
          created_at: string
          employee_id: string
          gross_ytd: number | null
          id: string
          is_submitted_to_accountant: boolean
          net_pay: number
          ni_ytd: number | null
          pay_period_end_date: string
          tax_paid_ytd: number | null
          total_deductions: number
          total_gross_pay: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          gross_ytd?: number | null
          id?: string
          is_submitted_to_accountant?: boolean
          net_pay: number
          ni_ytd?: number | null
          pay_period_end_date: string
          tax_paid_ytd?: number | null
          total_deductions: number
          total_gross_pay: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          gross_ytd?: number | null
          id?: string
          is_submitted_to_accountant?: boolean
          net_pay?: number
          ni_ytd?: number | null
          pay_period_end_date?: string
          tax_paid_ytd?: number | null
          total_deductions?: number
          total_gross_pay?: number
        }
        Relationships: [
          {
            foreignKeyName: 'payroll_records_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      pk_passport_application_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      pk_passport_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      pk_passport_pages: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          option_label: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          option_label: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          option_label?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pk_passport_pricing: {
        Row: {
          application_type: string
          category: string
          cost_price: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          pages: string | null
          sale_price: number | null
          speed: string
          updated_at: string | null
        }
        Insert: {
          application_type: string
          category: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          pages?: string | null
          sale_price?: number | null
          speed: string
          updated_at?: string | null
        }
        Update: {
          application_type?: string
          category?: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          pages?: string | null
          sale_price?: number | null
          speed?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pk_passport_speeds: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      pnl_reporting_categories: {
        Row: {
          category_name: string
          created_at: string
          id: string
          is_expense: boolean
          source_category: string | null
          source_table: Database['public']['Enums']['report_source_type']
        }
        Insert: {
          category_name: string
          created_at?: string
          id?: string
          is_expense: boolean
          source_category?: string | null
          source_table: Database['public']['Enums']['report_source_type']
        }
        Update: {
          category_name?: string
          created_at?: string
          id?: string
          is_expense?: boolean
          source_category?: string | null
          source_table?: Database['public']['Enums']['report_source_type']
        }
        Relationships: []
      }
      poc_details: {
        Row: {
          id: string
          service_option: Database['public']['Enums']['poc_service_option']
        }
        Insert: {
          id: string
          service_option: Database['public']['Enums']['poc_service_option']
        }
        Update: {
          id?: string
          service_option?: Database['public']['Enums']['poc_service_option']
        }
        Relationships: [
          {
            foreignKeyName: 'poc_details_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'nadra_services'
            referencedColumns: ['id']
          },
        ]
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
      roles: {
        Row: {
          id: string
          level: number
          name: string
        }
        Insert: {
          id?: string
          level: number
          name: string
        }
        Update: {
          id?: string
          level?: number
          name?: string
        }
        Relationships: []
      }
      service_pricing: {
        Row: {
          category: string
          cost_price: number | null
          created_at: string | null
          id: string
          is_active: boolean
          notes: string | null
          sale_price: number
          section: string
          service_name: string
          service_option: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          sale_price?: number
          section?: string
          service_name: string
          service_option?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          sale_price?: number
          section?: string
          service_name?: string
          service_option?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      supplier_vendors: {
        Row: {
          created_at: string
          id: string
          is_approved: boolean
          name: string
          vendor_type: Database['public']['Enums']['vendor_category']
        }
        Insert: {
          created_at?: string
          id?: string
          is_approved?: boolean
          name: string
          vendor_type: Database['public']['Enums']['vendor_category']
        }
        Update: {
          created_at?: string
          id?: string
          is_approved?: boolean
          name?: string
          vendor_type?: Database['public']['Enums']['vendor_category']
        }
        Relationships: []
      }
      ticket_airports: {
        Row: {
          airport_type: string | null
          city: string
          country_code: string
          country_name: string | null
          created_at: string
          iata_code: string
          icao_code: string | null
          is_active: boolean
          latitude_deg: number | null
          longitude_deg: number | null
          name: string
          region_code: string | null
          region_name: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          airport_type?: string | null
          city: string
          country_code: string
          country_name?: string | null
          created_at?: string
          iata_code: string
          icao_code?: string | null
          is_active?: boolean
          latitude_deg?: number | null
          longitude_deg?: number | null
          name: string
          region_code?: string | null
          region_name?: string | null
          timezone: string
          updated_at?: string
        }
        Update: {
          airport_type?: string | null
          city?: string
          country_code?: string
          country_name?: string | null
          created_at?: string
          iata_code?: string
          icao_code?: string | null
          is_active?: boolean
          latitude_deg?: number | null
          longitude_deg?: number | null
          name?: string
          region_code?: string | null
          region_name?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_attribution_write_contexts: {
        Row: {
          actor_employee_id: string
          assistant_employee_ids: string[]
          booking_id: string | null
          context_mode: string
          created_at: string
          id: string
          primary_employee_id: string
          reason: string | null
        }
        Insert: {
          actor_employee_id: string
          assistant_employee_ids?: string[]
          booking_id?: string | null
          context_mode: string
          created_at?: string
          id?: string
          primary_employee_id: string
          reason?: string | null
        }
        Update: {
          actor_employee_id?: string
          assistant_employee_ids?: string[]
          booking_id?: string | null
          context_mode?: string
          created_at?: string
          id?: string
          primary_employee_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_attribution_write_contexts_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_attribution_write_contexts_primary_employee_id_fkey'
            columns: ['primary_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_audit_events: {
        Row: {
          action: string
          actor_employee_id: string
          after_state: Json | null
          before_state: Json | null
          booking_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reason: string | null
          transaction_id: string | null
        }
        Insert: {
          action: string
          actor_employee_id: string
          after_state?: Json | null
          before_state?: Json | null
          booking_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reason?: string | null
          transaction_id?: string | null
        }
        Update: {
          action?: string
          actor_employee_id?: string
          after_state?: Json | null
          before_state?: Json | null
          booking_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_audit_events_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_audit_events_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_audit_events_transaction_id_fkey'
            columns: ['transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_booking_attribution_assistants: {
        Row: {
          attribution_id: string
          booking_id: string
          created_at: string
          employee_id: string
          sort_order: number
        }
        Insert: {
          attribution_id: string
          booking_id: string
          created_at?: string
          employee_id: string
          sort_order: number
        }
        Update: {
          attribution_id?: string
          booking_id?: string
          created_at?: string
          employee_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_booking_attribution_assistants_attribution_booking_fkey'
            columns: ['attribution_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_booking_attribution_versions'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_assistants_attribution_booking_fkey'
            columns: ['attribution_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_booking_current_attribution'
            referencedColumns: ['attribution_id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_assistants_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_booking_attribution_versions: {
        Row: {
          attribution_version: number
          booking_id: string
          change_kind: string
          changed_by_employee_id: string
          created_at: string
          entered_by_employee_id: string
          id: string
          primary_employee_id: string
          reason: string | null
          root_transaction_id: string
          supersedes_attribution_id: string | null
        }
        Insert: {
          attribution_version: number
          booking_id: string
          change_kind: string
          changed_by_employee_id: string
          created_at?: string
          entered_by_employee_id: string
          id?: string
          primary_employee_id: string
          reason?: string | null
          root_transaction_id: string
          supersedes_attribution_id?: string | null
        }
        Update: {
          attribution_version?: number
          booking_id?: string
          change_kind?: string
          changed_by_employee_id?: string
          created_at?: string
          entered_by_employee_id?: string
          id?: string
          primary_employee_id?: string
          reason?: string | null
          root_transaction_id?: string
          supersedes_attribution_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_booking_attribution_versions_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_changed_by_employee_id_fkey'
            columns: ['changed_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_entered_by_employee_id_fkey'
            columns: ['entered_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_primary_employee_id_fkey'
            columns: ['primary_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_root_booking_fkey'
            columns: ['root_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_supersedes_booking_fkey'
            columns: ['supersedes_attribution_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_booking_attribution_versions'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_supersedes_booking_fkey'
            columns: ['supersedes_attribution_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_booking_current_attribution'
            referencedColumns: ['attribution_id', 'booking_id']
          },
        ]
      }
      ticket_bookings: {
        Row: {
          airline_id: string
          archived_at: string | null
          booking_date: string
          commission_scope: string
          contact_phone: string | null
          created_at: string
          created_by: string
          customer_name: string
          departure_date: string | null
          id: string
          location_id: string
          normalized_pnr: string | null
          operational_status: string
          owner_employee_id: string
          package_match_status: string
          payment_status: string
          pnr: string
          return_date: string | null
          supplier_code: string
          supplier_name: string
          time_limit_at: string | null
          time_limit_timezone: string | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          airline_id: string
          archived_at?: string | null
          booking_date: string
          commission_scope?: string
          contact_phone?: string | null
          created_at?: string
          created_by: string
          customer_name: string
          departure_date?: string | null
          id?: string
          location_id: string
          normalized_pnr?: string | null
          operational_status?: string
          owner_employee_id: string
          package_match_status?: string
          payment_status?: string
          pnr: string
          return_date?: string | null
          supplier_code?: string
          supplier_name?: string
          time_limit_at?: string | null
          time_limit_timezone?: string | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          airline_id?: string
          archived_at?: string | null
          booking_date?: string
          commission_scope?: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          customer_name?: string
          departure_date?: string | null
          id?: string
          location_id?: string
          normalized_pnr?: string | null
          operational_status?: string
          owner_employee_id?: string
          package_match_status?: string
          payment_status?: string
          pnr?: string
          return_date?: string | null
          supplier_code?: string
          supplier_name?: string
          time_limit_at?: string | null
          time_limit_timezone?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_bookings_airline_id_fkey'
            columns: ['airline_id']
            isOneToOne: false
            referencedRelation: 'airlines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_bookings_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_bookings_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_bookings_owner_employee_id_fkey'
            columns: ['owner_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_bookings_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_change_requests: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          request_notes: string | null
          request_type: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          request_notes?: string | null
          request_type: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          request_notes?: string | null
          request_type?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_change_requests_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_change_requests_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_change_requests_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_fare_adjustments: {
        Row: {
          acting_employee_id: string
          actor_location_id: string
          booking_id: string
          booking_location_id: string
          commission_scope: string
          created_at: string
          currency: string
          difference_gbp: number | null
          difference_source: number | null
          effective_on: string
          group_id: string | null
          id: string
          new_fare_gbp: number
          new_fare_source: number
          notes: string | null
          original_fare_gbp: number
          original_fare_source: number
          owner_employee_id: string
          package_id: string | null
          package_link_ids: string[]
          package_match_status: string
          package_type: string | null
          passenger_ticket_count: number
          previous_adjustment_id: string | null
          reservation_id: string | null
          root_transaction_id: string
          sequence_number: number
        }
        Insert: {
          acting_employee_id: string
          actor_location_id: string
          booking_id: string
          booking_location_id: string
          commission_scope: string
          created_at?: string
          currency?: string
          difference_gbp?: number | null
          difference_source?: number | null
          effective_on: string
          group_id?: string | null
          id?: string
          new_fare_gbp: number
          new_fare_source: number
          notes?: string | null
          original_fare_gbp: number
          original_fare_source: number
          owner_employee_id: string
          package_id?: string | null
          package_link_ids?: string[]
          package_match_status: string
          package_type?: string | null
          passenger_ticket_count: number
          previous_adjustment_id?: string | null
          reservation_id?: string | null
          root_transaction_id: string
          sequence_number: number
        }
        Update: {
          acting_employee_id?: string
          actor_location_id?: string
          booking_id?: string
          booking_location_id?: string
          commission_scope?: string
          created_at?: string
          currency?: string
          difference_gbp?: number | null
          difference_source?: number | null
          effective_on?: string
          group_id?: string | null
          id?: string
          new_fare_gbp?: number
          new_fare_source?: number
          notes?: string | null
          original_fare_gbp?: number
          original_fare_source?: number
          owner_employee_id?: string
          package_id?: string | null
          package_link_ids?: string[]
          package_match_status?: string
          package_type?: string | null
          passenger_ticket_count?: number
          previous_adjustment_id?: string | null
          reservation_id?: string | null
          root_transaction_id?: string
          sequence_number?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_fare_adjustments_acting_employee_id_fkey'
            columns: ['acting_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_actor_location_id_fkey'
            columns: ['actor_location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_booking_location_id_fkey'
            columns: ['booking_location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_owner_employee_id_fkey'
            columns: ['owner_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_previous_same_booking_fkey'
            columns: ['previous_adjustment_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustment_current'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_previous_same_booking_fkey'
            columns: ['previous_adjustment_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustments'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_root_same_booking_fkey'
            columns: ['root_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
        ]
      }
      ticket_fare_checks: {
        Row: {
          booking_id: string
          booking_version: number
          checked_by_employee_id: string
          commission_scope: string
          created_at: string
          currency: string
          current_adjustment_id: string | null
          effective_on: string
          group_id: string | null
          id: string
          idempotency_key: string
          notes: string | null
          observed_fare_gbp: number
          observed_fare_source: number
          package_id: string | null
          package_match_status: string
          reservation_id: string | null
          root_transaction_id: string
          root_transaction_version: number
        }
        Insert: {
          booking_id: string
          booking_version: number
          checked_by_employee_id: string
          commission_scope: string
          created_at?: string
          currency?: string
          current_adjustment_id?: string | null
          effective_on: string
          group_id?: string | null
          id?: string
          idempotency_key: string
          notes?: string | null
          observed_fare_gbp: number
          observed_fare_source: number
          package_id?: string | null
          package_match_status: string
          reservation_id?: string | null
          root_transaction_id: string
          root_transaction_version: number
        }
        Update: {
          booking_id?: string
          booking_version?: number
          checked_by_employee_id?: string
          commission_scope?: string
          created_at?: string
          currency?: string
          current_adjustment_id?: string | null
          effective_on?: string
          group_id?: string | null
          id?: string
          idempotency_key?: string
          notes?: string | null
          observed_fare_gbp?: number
          observed_fare_source?: number
          package_id?: string | null
          package_match_status?: string
          reservation_id?: string | null
          root_transaction_id?: string
          root_transaction_version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_fare_checks_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_checked_by_employee_id_fkey'
            columns: ['checked_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_current_adjustment_id_fkey'
            columns: ['current_adjustment_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustment_current'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_current_adjustment_id_fkey'
            columns: ['current_adjustment_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_root_transaction_id_fkey'
            columns: ['root_transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_flight_api_sector_state: {
        Row: {
          last_check_status: string | null
          last_checked_at: string | null
          last_error: string | null
          last_provider_schedule: Json | null
          last_provider_status: string | null
          last_weekly_checked_at: string | null
          predeparture_checked_at: string | null
          schedule_change_detected_at: string | null
          sector_id: string
          updated_at: string
        }
        Insert: {
          last_check_status?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_provider_schedule?: Json | null
          last_provider_status?: string | null
          last_weekly_checked_at?: string | null
          predeparture_checked_at?: string | null
          schedule_change_detected_at?: string | null
          sector_id: string
          updated_at?: string
        }
        Update: {
          last_check_status?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_provider_schedule?: Json | null
          last_provider_status?: string | null
          last_weekly_checked_at?: string | null
          predeparture_checked_at?: string | null
          schedule_change_detected_at?: string | null
          sector_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_flight_api_sector_state_sector_id_fkey'
            columns: ['sector_id']
            isOneToOne: true
            referencedRelation: 'ticket_itinerary_sectors'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_flight_api_settings: {
        Row: {
          enabled: boolean
          max_checks_per_run: number
          monthly_limit: number
          predeparture_hours: number
          provider: string
          singleton: boolean
          updated_at: string
          updated_by: string | null
          weekly_interval_days: number
        }
        Insert: {
          enabled?: boolean
          max_checks_per_run?: number
          monthly_limit?: number
          predeparture_hours?: number
          provider?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          weekly_interval_days?: number
        }
        Update: {
          enabled?: boolean
          max_checks_per_run?: number
          monthly_limit?: number
          predeparture_hours?: number
          provider?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          weekly_interval_days?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_flight_api_settings_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_flight_api_usage: {
        Row: {
          check_kind: string
          completed_at: string | null
          endpoint: string
          error_message: string | null
          http_status: number | null
          id: string
          outcome: string
          provider: string
          requested_at: string
          sector_id: string | null
          units: number
        }
        Insert: {
          check_kind: string
          completed_at?: string | null
          endpoint: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          outcome: string
          provider?: string
          requested_at?: string
          sector_id?: string | null
          units?: number
        }
        Update: {
          check_kind?: string
          completed_at?: string | null
          endpoint?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          outcome?: string
          provider?: string
          requested_at?: string
          sector_id?: string | null
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_flight_api_usage_sector_id_fkey'
            columns: ['sector_id']
            isOneToOne: false
            referencedRelation: 'ticket_itinerary_sectors'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_idempotency_keys: {
        Row: {
          action_name: string
          actor_employee_id: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          request_payload: Json
          response_payload: Json | null
        }
        Insert: {
          action_name: string
          actor_employee_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          request_payload: Json
          response_payload?: Json | null
        }
        Update: {
          action_name?: string
          actor_employee_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          request_payload?: Json
          response_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_idempotency_keys_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_initial_pricing_contexts: {
        Row: {
          actor_employee_id: string
          created_at: string
          id: string
          transaction_id: string
        }
        Insert: {
          actor_employee_id: string
          created_at?: string
          id?: string
          transaction_id: string
        }
        Update: {
          actor_employee_id?: string
          created_at?: string
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_initial_pricing_contexts_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_initial_pricing_contexts_transaction_id_fkey'
            columns: ['transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_itinerary_sectors: {
        Row: {
          airline_id: string | null
          arrival_at_utc: string | null
          arrival_local: string | null
          arrival_timezone: string | null
          booking_id: string
          created_at: string
          created_by: string
          departure_at_utc: string
          departure_local: string
          departure_timezone: string
          destination_airport_code: string
          flight_number: string | null
          id: string
          is_active: boolean
          itinerary_version: number
          origin_airport_code: string
          retired_at: string | null
          retired_by: string | null
          schedule_status: string
          sequence_number: number
          source_transaction_id: string | null
          updated_at: string
        }
        Insert: {
          airline_id?: string | null
          arrival_at_utc?: string | null
          arrival_local?: string | null
          arrival_timezone?: string | null
          booking_id: string
          created_at?: string
          created_by: string
          departure_at_utc: string
          departure_local: string
          departure_timezone: string
          destination_airport_code: string
          flight_number?: string | null
          id?: string
          is_active?: boolean
          itinerary_version?: number
          origin_airport_code: string
          retired_at?: string | null
          retired_by?: string | null
          schedule_status?: string
          sequence_number: number
          source_transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          airline_id?: string | null
          arrival_at_utc?: string | null
          arrival_local?: string | null
          arrival_timezone?: string | null
          booking_id?: string
          created_at?: string
          created_by?: string
          departure_at_utc?: string
          departure_local?: string
          departure_timezone?: string
          destination_airport_code?: string
          flight_number?: string | null
          id?: string
          is_active?: boolean
          itinerary_version?: number
          origin_airport_code?: string
          retired_at?: string | null
          retired_by?: string | null
          schedule_status?: string
          sequence_number?: number
          source_transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_itinerary_sectors_airline_id_fkey'
            columns: ['airline_id']
            isOneToOne: false
            referencedRelation: 'airlines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_itinerary_sectors_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_itinerary_sectors_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_itinerary_sectors_retired_by_fkey'
            columns: ['retired_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_itinerary_sectors_transaction_booking_fkey'
            columns: ['source_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
        ]
      }
      ticket_itinerary_write_contexts: {
        Row: {
          actor_employee_id: string
          booking_id: string
          changed_at: string
          created_at: string
          expected_insert_count: number
          expected_retire_count: number
          id: string
          inserted_count: number
          itinerary_version: number
          retired_count: number
          root_transaction_id: string
        }
        Insert: {
          actor_employee_id: string
          booking_id: string
          changed_at: string
          created_at?: string
          expected_insert_count: number
          expected_retire_count: number
          id?: string
          inserted_count?: number
          itinerary_version: number
          retired_count?: number
          root_transaction_id: string
        }
        Update: {
          actor_employee_id?: string
          booking_id?: string
          changed_at?: string
          created_at?: string
          expected_insert_count?: number
          expected_retire_count?: number
          id?: string
          inserted_count?: number
          itinerary_version?: number
          retired_count?: number
          root_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_itinerary_write_contexts_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_itinerary_write_contexts_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_itinerary_write_contexts_root_booking_fkey'
            columns: ['root_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
        ]
      }
      ticket_ledger: {
        Row: {
          airline_id: string | null
          booking_deadline: string | null
          booking_status: Database['public']['Enums']['ticket_booking_status']
          booking_type: Database['public']['Enums']['ticket_service_type']
          contact_phone: string | null
          created_at: string
          departure_date: string | null
          employee_id: string
          final_agent_id: string | null
          final_fare_cost: number | null
          id: string
          initial_fare_cost: number | null
          is_loyalty_claimed: boolean
          issued_date: string | null
          package_id: string | null
          passenger_name: string | null
          payment_status: Database['public']['Enums']['ticket_payment_status']
          pnr: string
          return_date: string | null
          sale_cost: number | null
          total_passengers: number
        }
        Insert: {
          airline_id?: string | null
          booking_deadline?: string | null
          booking_status?: Database['public']['Enums']['ticket_booking_status']
          booking_type: Database['public']['Enums']['ticket_service_type']
          contact_phone?: string | null
          created_at?: string
          departure_date?: string | null
          employee_id: string
          final_agent_id?: string | null
          final_fare_cost?: number | null
          id?: string
          initial_fare_cost?: number | null
          is_loyalty_claimed?: boolean
          issued_date?: string | null
          package_id?: string | null
          passenger_name?: string | null
          payment_status?: Database['public']['Enums']['ticket_payment_status']
          pnr: string
          return_date?: string | null
          sale_cost?: number | null
          total_passengers?: number
        }
        Update: {
          airline_id?: string | null
          booking_deadline?: string | null
          booking_status?: Database['public']['Enums']['ticket_booking_status']
          booking_type?: Database['public']['Enums']['ticket_service_type']
          contact_phone?: string | null
          created_at?: string
          departure_date?: string | null
          employee_id?: string
          final_agent_id?: string | null
          final_fare_cost?: number | null
          id?: string
          initial_fare_cost?: number | null
          is_loyalty_claimed?: boolean
          issued_date?: string | null
          package_id?: string | null
          passenger_name?: string | null
          payment_status?: Database['public']['Enums']['ticket_payment_status']
          pnr?: string
          return_date?: string | null
          sale_cost?: number | null
          total_passengers?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_ledger_airline_id_fkey'
            columns: ['airline_id']
            isOneToOne: false
            referencedRelation: 'airlines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_ledger_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_ledger_final_agent_id_fkey'
            columns: ['final_agent_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_ledger_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_legacy_migration_map: {
        Row: {
          booking_id: string | null
          created_at: string
          legacy_payload: Json
          legacy_ticket_ledger_id: string
          migration_status: string
          review_reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          transaction_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          legacy_payload: Json
          legacy_ticket_ledger_id: string
          migration_status?: string
          review_reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          transaction_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          legacy_payload?: Json
          legacy_ticket_ledger_id?: string
          migration_status?: string
          review_reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_legacy_migration_map_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_legacy_migration_map_legacy_ticket_ledger_id_fkey'
            columns: ['legacy_ticket_ledger_id']
            isOneToOne: true
            referencedRelation: 'ticket_ledger'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_legacy_migration_map_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_legacy_migration_map_transaction_id_fkey'
            columns: ['transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_notification_events: {
        Row: {
          booking_id: string | null
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_status: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          notification_type: string
          recipient_employee_id: string
          scheduled_for: string
          threshold_key: string
        }
        Insert: {
          booking_id?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          notification_type: string
          recipient_employee_id: string
          scheduled_for: string
          threshold_key: string
        }
        Update: {
          booking_id?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          notification_type?: string
          recipient_employee_id?: string
          scheduled_for?: string
          threshold_key?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_notification_events_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_notification_events_recipient_employee_id_fkey'
            columns: ['recipient_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_package_links: {
        Row: {
          booking_id: string
          detected_at: string
          group_id: string | null
          id: string
          match_status: string
          matched_pnr: string
          package_id: string | null
          package_reference_snapshot: string | null
          package_type_snapshot: string | null
          reservation_id: string | null
          resolution_method: string
          resolution_reason: string | null
          resolved_by: string | null
          retired_at: string | null
        }
        Insert: {
          booking_id: string
          detected_at?: string
          group_id?: string | null
          id?: string
          match_status: string
          matched_pnr: string
          package_id?: string | null
          package_reference_snapshot?: string | null
          package_type_snapshot?: string | null
          reservation_id?: string | null
          resolution_method?: string
          resolution_reason?: string | null
          resolved_by?: string | null
          retired_at?: string | null
        }
        Update: {
          booking_id?: string
          detected_at?: string
          group_id?: string | null
          id?: string
          match_status?: string
          matched_pnr?: string
          package_id?: string | null
          package_reference_snapshot?: string | null
          package_type_snapshot?: string | null
          reservation_id?: string | null
          resolution_method?: string
          resolution_reason?: string | null
          resolved_by?: string | null
          retired_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_package_links_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_package_links_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_package_links_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_package_links_reservation_package_fkey'
            columns: ['reservation_id', 'package_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id', 'package_id']
          },
          {
            foreignKeyName: 'ticket_package_links_resolved_by_fkey'
            columns: ['resolved_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_passenger_fare_lines: {
        Row: {
          created_at: string
          currency: string
          id: string
          passenger_type: string
          quantity: number
          sale_total_gbp: number | null
          sale_total_source: number | null
          supplier_total_gbp: number | null
          supplier_total_source: number | null
          transaction_id: string
          unit_discount_gbp: number
          unit_discount_source: number
          unit_gross_sale_price_gbp: number | null
          unit_gross_sale_price_source: number | null
          unit_sale_price_gbp: number | null
          unit_sale_price_source: number | null
          unit_supplier_cost_gbp: number | null
          unit_supplier_cost_source: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          passenger_type: string
          quantity: number
          sale_total_gbp?: number | null
          sale_total_source?: number | null
          supplier_total_gbp?: number | null
          supplier_total_source?: number | null
          transaction_id: string
          unit_discount_gbp?: number
          unit_discount_source?: number
          unit_gross_sale_price_gbp?: number | null
          unit_gross_sale_price_source?: number | null
          unit_sale_price_gbp?: number | null
          unit_sale_price_source?: number | null
          unit_supplier_cost_gbp?: number | null
          unit_supplier_cost_source?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          passenger_type?: string
          quantity?: number
          sale_total_gbp?: number | null
          sale_total_source?: number | null
          supplier_total_gbp?: number | null
          supplier_total_source?: number | null
          transaction_id?: string
          unit_discount_gbp?: number
          unit_discount_source?: number
          unit_gross_sale_price_gbp?: number | null
          unit_gross_sale_price_source?: number | null
          unit_sale_price_gbp?: number | null
          unit_sale_price_source?: number | null
          unit_supplier_cost_gbp?: number | null
          unit_supplier_cost_source?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_passenger_fare_lines_transaction_id_fkey'
            columns: ['transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_passengers: {
        Row: {
          booking_id: string
          contact_phone: string | null
          created_at: string
          created_by: string
          date_of_birth: string | null
          full_name: string | null
          id: string
          passenger_type: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          contact_phone?: string | null
          created_at?: string
          created_by: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          passenger_type: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          passenger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_passengers_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_passengers_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_refund_events: {
        Row: {
          actor_employee_id: string
          amount_gbp: number | null
          created_at: string
          event_data: Json
          event_date: string
          event_type: string
          id: string
          idempotency_key: string
          notes: string | null
          reference: string | null
          refund_id: string
        }
        Insert: {
          actor_employee_id: string
          amount_gbp?: number | null
          created_at?: string
          event_data?: Json
          event_date: string
          event_type: string
          id?: string
          idempotency_key: string
          notes?: string | null
          reference?: string | null
          refund_id: string
        }
        Update: {
          actor_employee_id?: string
          amount_gbp?: number | null
          created_at?: string
          event_data?: Json
          event_date?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          reference?: string | null
          refund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_refund_events_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refund_events_refund_id_fkey'
            columns: ['refund_id']
            isOneToOne: false
            referencedRelation: 'ticket_refunds'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_refund_write_contexts: {
        Row: {
          actor_employee_id: string
          created_at: string
          id: string
          refund_id: string
        }
        Insert: {
          actor_employee_id: string
          created_at?: string
          id: string
          refund_id: string
        }
        Update: {
          actor_employee_id?: string
          created_at?: string
          id?: string
          refund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_refund_write_contexts_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refund_write_contexts_refund_id_fkey'
            columns: ['refund_id']
            isOneToOne: false
            referencedRelation: 'ticket_refunds'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_refunds: {
        Row: {
          actual_company_result_gbp: number | null
          airline_cancellation_fee_gbp: number
          airline_id: string
          airline_recovered_gbp: number
          airline_recovery_final: boolean
          booking_id: string
          cancellation_credit_applied_gbp: number | null
          closed_at: string | null
          commission_scope: string
          created_at: string
          created_by_employee_id: string
          customer_credit_remaining_gbp: number | null
          customer_settled_gbp: number
          desired_company_markup_gbp: number
          expected_airline_recovery_gbp: number
          expected_company_result_gbp: number
          formula_version: string
          id: string
          idempotency_key: string
          notes: string | null
          original_sale_price_gbp: number
          original_supplier_cost_gbp: number
          other_actual_costs_gbp: number
          override_reason: string | null
          owner_employee_id: string
          package_group_id: string | null
          package_id: string | null
          package_link_id: string | null
          package_match_status: string
          package_reservation_id: string | null
          package_type_snapshot: string | null
          passenger_id: string
          passenger_name: string | null
          passenger_type: string
          pnr: string
          proposed_cancellation_charge_gbp: number
          proposed_customer_refund_gbp: number
          replacement_agent_commission_gbp: number | null
          replacement_booking_id: string | null
          replacement_company_result_gbp: number | null
          replacement_desired_markup_gbp: number | null
          replacement_extra_payment_gbp: number | null
          replacement_net_zero_price_gbp: number | null
          replacement_safe_price_gbp: number | null
          replacement_sale_price_gbp: number | null
          replacement_source: string | null
          replacement_supplier_cost_gbp: number | null
          replacement_transaction_passenger_id: string | null
          retained_agent_commission_gbp: number
          settlement_mode: string
          status: string
          supplier_cancellation_charge_gbp: number
          ticket_number: string
          transaction_id: string
          transaction_passenger_id: string
          updated_at: string
          version: number
        }
        Insert: {
          actual_company_result_gbp?: number | null
          airline_cancellation_fee_gbp: number
          airline_id: string
          airline_recovered_gbp?: number
          airline_recovery_final?: boolean
          booking_id: string
          cancellation_credit_applied_gbp?: number | null
          closed_at?: string | null
          commission_scope: string
          created_at?: string
          created_by_employee_id: string
          customer_credit_remaining_gbp?: number | null
          customer_settled_gbp?: number
          desired_company_markup_gbp: number
          expected_airline_recovery_gbp: number
          expected_company_result_gbp: number
          formula_version: string
          id?: string
          idempotency_key: string
          notes?: string | null
          original_sale_price_gbp: number
          original_supplier_cost_gbp: number
          other_actual_costs_gbp?: number
          override_reason?: string | null
          owner_employee_id: string
          package_group_id?: string | null
          package_id?: string | null
          package_link_id?: string | null
          package_match_status: string
          package_reservation_id?: string | null
          package_type_snapshot?: string | null
          passenger_id: string
          passenger_name?: string | null
          passenger_type: string
          pnr: string
          proposed_cancellation_charge_gbp: number
          proposed_customer_refund_gbp: number
          replacement_agent_commission_gbp?: number | null
          replacement_booking_id?: string | null
          replacement_company_result_gbp?: number | null
          replacement_desired_markup_gbp?: number | null
          replacement_extra_payment_gbp?: number | null
          replacement_net_zero_price_gbp?: number | null
          replacement_safe_price_gbp?: number | null
          replacement_sale_price_gbp?: number | null
          replacement_source?: string | null
          replacement_supplier_cost_gbp?: number | null
          replacement_transaction_passenger_id?: string | null
          retained_agent_commission_gbp: number
          settlement_mode: string
          status?: string
          supplier_cancellation_charge_gbp: number
          ticket_number: string
          transaction_id: string
          transaction_passenger_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          actual_company_result_gbp?: number | null
          airline_cancellation_fee_gbp?: number
          airline_id?: string
          airline_recovered_gbp?: number
          airline_recovery_final?: boolean
          booking_id?: string
          cancellation_credit_applied_gbp?: number | null
          closed_at?: string | null
          commission_scope?: string
          created_at?: string
          created_by_employee_id?: string
          customer_credit_remaining_gbp?: number | null
          customer_settled_gbp?: number
          desired_company_markup_gbp?: number
          expected_airline_recovery_gbp?: number
          expected_company_result_gbp?: number
          formula_version?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          original_sale_price_gbp?: number
          original_supplier_cost_gbp?: number
          other_actual_costs_gbp?: number
          override_reason?: string | null
          owner_employee_id?: string
          package_group_id?: string | null
          package_id?: string | null
          package_link_id?: string | null
          package_match_status?: string
          package_reservation_id?: string | null
          package_type_snapshot?: string | null
          passenger_id?: string
          passenger_name?: string | null
          passenger_type?: string
          pnr?: string
          proposed_cancellation_charge_gbp?: number
          proposed_customer_refund_gbp?: number
          replacement_agent_commission_gbp?: number | null
          replacement_booking_id?: string | null
          replacement_company_result_gbp?: number | null
          replacement_desired_markup_gbp?: number | null
          replacement_extra_payment_gbp?: number | null
          replacement_net_zero_price_gbp?: number | null
          replacement_safe_price_gbp?: number | null
          replacement_sale_price_gbp?: number | null
          replacement_source?: string | null
          replacement_supplier_cost_gbp?: number | null
          replacement_transaction_passenger_id?: string | null
          retained_agent_commission_gbp?: number
          settlement_mode?: string
          status?: string
          supplier_cancellation_charge_gbp?: number
          ticket_number?: string
          transaction_id?: string
          transaction_passenger_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_refunds_airline_id_fkey'
            columns: ['airline_id']
            isOneToOne: false
            referencedRelation: 'airlines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_created_by_employee_id_fkey'
            columns: ['created_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_owner_employee_id_fkey'
            columns: ['owner_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_package_group_id_fkey'
            columns: ['package_group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_package_link_id_fkey'
            columns: ['package_link_id']
            isOneToOne: false
            referencedRelation: 'ticket_package_links'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_package_reservation_id_fkey'
            columns: ['package_reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_passenger_id_fkey'
            columns: ['passenger_id']
            isOneToOne: false
            referencedRelation: 'ticket_passengers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_replacement_booking_id_fkey'
            columns: ['replacement_booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_replacement_transaction_passenger_id_fkey'
            columns: ['replacement_transaction_passenger_id']
            isOneToOne: false
            referencedRelation: 'ticket_transaction_passengers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_transaction_id_fkey'
            columns: ['transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_refunds_transaction_passenger_id_fkey'
            columns: ['transaction_passenger_id']
            isOneToOne: false
            referencedRelation: 'ticket_transaction_passengers'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_schedule_events: {
        Row: {
          actor_employee_id: string
          change_case_id: string
          created_at: string
          event_type: string
          event_version: number
          id: string
          previous_schedule: Json
          proposed_schedule: Json
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sector_id: string
        }
        Insert: {
          actor_employee_id: string
          change_case_id: string
          created_at?: string
          event_type: string
          event_version: number
          id?: string
          previous_schedule?: Json
          proposed_schedule?: Json
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sector_id: string
        }
        Update: {
          actor_employee_id?: string
          change_case_id?: string
          created_at?: string
          event_type?: string
          event_version?: number
          id?: string
          previous_schedule?: Json
          proposed_schedule?: Json
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sector_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_schedule_events_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_schedule_events_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_schedule_events_sector_id_fkey'
            columns: ['sector_id']
            isOneToOne: false
            referencedRelation: 'ticket_itinerary_sectors'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_schedule_write_contexts: {
        Row: {
          actor_employee_id: string
          consumed: boolean
          created_at: string
          from_status: string
          id: string
          sector_id: string
          to_status: string
        }
        Insert: {
          actor_employee_id: string
          consumed?: boolean
          created_at?: string
          from_status: string
          id?: string
          sector_id: string
          to_status: string
        }
        Update: {
          actor_employee_id?: string
          consumed?: boolean
          created_at?: string
          from_status?: string
          id?: string
          sector_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_schedule_write_contexts_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_schedule_write_contexts_sector_id_fkey'
            columns: ['sector_id']
            isOneToOne: false
            referencedRelation: 'ticket_itinerary_sectors'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_transaction_passengers: {
        Row: {
          booking_id: string
          created_at: string
          fare_line_id: string | null
          id: string
          passenger_id: string
          position: number
          ticket_number: string | null
          transaction_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          fare_line_id?: string | null
          id?: string
          passenger_id: string
          position: number
          ticket_number?: string | null
          transaction_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          fare_line_id?: string | null
          id?: string
          passenger_id?: string
          position?: number
          ticket_number?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_transaction_passengers_fare_line_transaction_fkey'
            columns: ['fare_line_id', 'transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_passenger_fare_lines'
            referencedColumns: ['id', 'transaction_id']
          },
          {
            foreignKeyName: 'ticket_transaction_passengers_passenger_booking_fkey'
            columns: ['passenger_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_passengers'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_transaction_passengers_transaction_booking_fkey'
            columns: ['transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
        ]
      }
      ticket_transactions: {
        Row: {
          acting_employee_id: string
          booking_date: string
          booking_id: string
          cancelled_at: string | null
          correction_reason: string | null
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          issued_at: string | null
          notes: string | null
          operational_status: string
          owner_employee_id: string
          paid_at: string | null
          parent_transaction_id: string | null
          passenger_ticket_count: number
          payment_status: string
          refunded_at: string | null
          sale_price_gbp: number | null
          sale_price_source: number | null
          service_type: string
          supersedes_transaction_id: string | null
          supplier_cost_gbp: number | null
          supplier_cost_source: number | null
          time_limit_at: string | null
          time_limit_timezone: string | null
          updated_at: string
          version: number
        }
        Insert: {
          acting_employee_id: string
          booking_date: string
          booking_id: string
          cancelled_at?: string | null
          correction_reason?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          notes?: string | null
          operational_status?: string
          owner_employee_id: string
          paid_at?: string | null
          parent_transaction_id?: string | null
          passenger_ticket_count?: number
          payment_status?: string
          refunded_at?: string | null
          sale_price_gbp?: number | null
          sale_price_source?: number | null
          service_type: string
          supersedes_transaction_id?: string | null
          supplier_cost_gbp?: number | null
          supplier_cost_source?: number | null
          time_limit_at?: string | null
          time_limit_timezone?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          acting_employee_id?: string
          booking_date?: string
          booking_id?: string
          cancelled_at?: string | null
          correction_reason?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          notes?: string | null
          operational_status?: string
          owner_employee_id?: string
          paid_at?: string | null
          parent_transaction_id?: string | null
          passenger_ticket_count?: number
          payment_status?: string
          refunded_at?: string | null
          sale_price_gbp?: number | null
          sale_price_source?: number | null
          service_type?: string
          supersedes_transaction_id?: string | null
          supplier_cost_gbp?: number | null
          supplier_cost_source?: number | null
          time_limit_at?: string | null
          time_limit_timezone?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_transactions_acting_employee_id_fkey'
            columns: ['acting_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_transactions_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_transactions_owner_employee_id_fkey'
            columns: ['owner_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_transactions_parent_same_booking_fkey'
            columns: ['parent_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_transactions_supersedes_same_booking_fkey'
            columns: ['supersedes_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
        ]
      }
      ticket_voucher_events: {
        Row: {
          actor_employee_id: string
          amount_gbp: number | null
          created_at: string
          event_data: Json
          event_date: string
          event_type: string
          id: string
          idempotency_key: string
          linked_booking_id: string | null
          linked_transaction_passenger_id: string | null
          notes: string | null
          refund_id: string | null
          voucher_id: string
        }
        Insert: {
          actor_employee_id: string
          amount_gbp?: number | null
          created_at?: string
          event_data?: Json
          event_date: string
          event_type: string
          id?: string
          idempotency_key: string
          linked_booking_id?: string | null
          linked_transaction_passenger_id?: string | null
          notes?: string | null
          refund_id?: string | null
          voucher_id: string
        }
        Update: {
          actor_employee_id?: string
          amount_gbp?: number | null
          created_at?: string
          event_data?: Json
          event_date?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          linked_booking_id?: string | null
          linked_transaction_passenger_id?: string | null
          notes?: string | null
          refund_id?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_voucher_events_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_voucher_events_linked_booking_id_fkey'
            columns: ['linked_booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_voucher_events_linked_transaction_passenger_id_fkey'
            columns: ['linked_transaction_passenger_id']
            isOneToOne: false
            referencedRelation: 'ticket_transaction_passengers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_voucher_events_refund_id_fkey'
            columns: ['refund_id']
            isOneToOne: false
            referencedRelation: 'ticket_refunds'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_voucher_events_voucher_id_fkey'
            columns: ['voucher_id']
            isOneToOne: false
            referencedRelation: 'ticket_vouchers'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_voucher_write_contexts: {
        Row: {
          actor_employee_id: string
          created_at: string
          id: string
          voucher_id: string
        }
        Insert: {
          actor_employee_id: string
          created_at?: string
          id: string
          voucher_id: string
        }
        Update: {
          actor_employee_id?: string
          created_at?: string
          id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_voucher_write_contexts_actor_employee_id_fkey'
            columns: ['actor_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_voucher_write_contexts_voucher_id_fkey'
            columns: ['voucher_id']
            isOneToOne: false
            referencedRelation: 'ticket_vouchers'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_vouchers: {
        Row: {
          airline_id: string
          airline_reference: string | null
          booking_id: string
          cancellation_date: string
          claim_by_date: string
          confirmed_value_gbp: number | null
          created_at: string
          created_by_employee_id: string
          follow_up_employee_id: string
          id: string
          idempotency_key: string
          issue_date: string
          notes: string | null
          owner_employee_id: string
          passenger_id: string
          passenger_name: string | null
          passenger_type: string
          pnr: string
          remaining_value_gbp: number | null
          status: string
          ticket_number: string
          transaction_id: string
          transaction_passenger_id: string
          updated_at: string
          version: number
        }
        Insert: {
          airline_id: string
          airline_reference?: string | null
          booking_id: string
          cancellation_date: string
          claim_by_date: string
          confirmed_value_gbp?: number | null
          created_at?: string
          created_by_employee_id: string
          follow_up_employee_id: string
          id?: string
          idempotency_key: string
          issue_date: string
          notes?: string | null
          owner_employee_id: string
          passenger_id: string
          passenger_name?: string | null
          passenger_type: string
          pnr: string
          remaining_value_gbp?: number | null
          status?: string
          ticket_number: string
          transaction_id: string
          transaction_passenger_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          airline_id?: string
          airline_reference?: string | null
          booking_id?: string
          cancellation_date?: string
          claim_by_date?: string
          confirmed_value_gbp?: number | null
          created_at?: string
          created_by_employee_id?: string
          follow_up_employee_id?: string
          id?: string
          idempotency_key?: string
          issue_date?: string
          notes?: string | null
          owner_employee_id?: string
          passenger_id?: string
          passenger_name?: string | null
          passenger_type?: string
          pnr?: string
          remaining_value_gbp?: number | null
          status?: string
          ticket_number?: string
          transaction_id?: string
          transaction_passenger_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_vouchers_airline_id_fkey'
            columns: ['airline_id']
            isOneToOne: false
            referencedRelation: 'airlines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_vouchers_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_vouchers_created_by_employee_id_fkey'
            columns: ['created_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_vouchers_follow_up_employee_id_fkey'
            columns: ['follow_up_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_vouchers_owner_employee_id_fkey'
            columns: ['owner_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_vouchers_passenger_id_fkey'
            columns: ['passenger_id']
            isOneToOne: false
            referencedRelation: 'ticket_passengers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_vouchers_transaction_id_fkey'
            columns: ['transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_vouchers_transaction_passenger_id_fkey'
            columns: ['transaction_passenger_id']
            isOneToOne: true
            referencedRelation: 'ticket_transaction_passengers'
            referencedColumns: ['id']
          },
        ]
      }
      timeclock_device_manual_code_limits: {
        Row: {
          device_id: string
          next_allowed_at: string
          updated_at: string
        }
        Insert: {
          device_id: string
          next_allowed_at: string
          updated_at?: string
        }
        Update: {
          device_id?: string
          next_allowed_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'timeclock_device_manual_code_limits_device_id_fkey'
            columns: ['device_id']
            isOneToOne: true
            referencedRelation: 'timeclock_devices'
            referencedColumns: ['id']
          },
        ]
      }
      timeclock_device_request_nonces: {
        Row: {
          created_at: string
          device_id: string
          expires_at: string
          nonce: string
        }
        Insert: {
          created_at?: string
          device_id: string
          expires_at: string
          nonce: string
        }
        Update: {
          created_at?: string
          device_id?: string
          expires_at?: string
          nonce?: string
        }
        Relationships: [
          {
            foreignKeyName: 'timeclock_device_request_nonces_device_id_fkey'
            columns: ['device_id']
            isOneToOne: false
            referencedRelation: 'timeclock_devices'
            referencedColumns: ['id']
          },
        ]
      }
      timeclock_devices: {
        Row: {
          created_at: string | null
          device_type: string
          firmware_version: string | null
          free_heap: number | null
          id: string
          ip: string | null
          is_active: boolean | null
          last_seen_at: string | null
          location: string | null
          location_id: string | null
          name: string
          qr_interval_sec: number
          secret: string
          updated_at: string | null
          uptime_sec: number | null
          wifi_rssi: number | null
        }
        Insert: {
          created_at?: string | null
          device_type?: string
          firmware_version?: string | null
          free_heap?: number | null
          id?: string
          ip?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          location?: string | null
          location_id?: string | null
          name: string
          qr_interval_sec?: number
          secret: string
          updated_at?: string | null
          uptime_sec?: number | null
          wifi_rssi?: number | null
        }
        Update: {
          created_at?: string | null
          device_type?: string
          firmware_version?: string | null
          free_heap?: number | null
          id?: string
          ip?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          location?: string | null
          location_id?: string | null
          name?: string
          qr_interval_sec?: number
          secret?: string
          updated_at?: string | null
          uptime_sec?: number | null
          wifi_rssi?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'timeclock_devices_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      timeclock_events: {
        Row: {
          adjusted_at: string | null
          adjusted_by: string | null
          adjusted_device_ts: string | null
          adjusted_scanned_at: string | null
          adjustment_reason: string | null
          created_at: string | null
          device_id: string
          device_ts: string
          employee_id: string
          event_type: string
          geo: Json | null
          hash: string
          id: string
          ip: string | null
          nonce: string
          prev_hash: string | null
          punch_type: string
          qr_payload: Json
          scanned_at: string | null
          user_agent: string | null
        }
        Insert: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjusted_device_ts?: string | null
          adjusted_scanned_at?: string | null
          adjustment_reason?: string | null
          created_at?: string | null
          device_id: string
          device_ts: string
          employee_id: string
          event_type?: string
          geo?: Json | null
          hash: string
          id?: string
          ip?: string | null
          nonce: string
          prev_hash?: string | null
          punch_type?: string
          qr_payload: Json
          scanned_at?: string | null
          user_agent?: string | null
        }
        Update: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjusted_device_ts?: string | null
          adjusted_scanned_at?: string | null
          adjustment_reason?: string | null
          created_at?: string | null
          device_id?: string
          device_ts?: string
          employee_id?: string
          event_type?: string
          geo?: Json | null
          hash?: string
          id?: string
          ip?: string | null
          nonce?: string
          prev_hash?: string | null
          punch_type?: string
          qr_payload?: Json
          scanned_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'timeclock_events_device_id_fkey'
            columns: ['device_id']
            isOneToOne: false
            referencedRelation: 'timeclock_devices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'timeclock_events_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      timeclock_manual_codes: {
        Row: {
          code: string
          created_at: string | null
          device_id: string
          expires_at: string
          id: number
          qr_payload: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          device_id: string
          expires_at: string
          id?: number
          qr_payload: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          device_id?: string
          expires_at?: string
          id?: number
          qr_payload?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'timeclock_manual_codes_device_id_fkey'
            columns: ['device_id']
            isOneToOne: false
            referencedRelation: 'timeclock_devices'
            referencedColumns: ['id']
          },
        ]
      }
      timeclock_qr_nonces: {
        Row: {
          created_at: string
          device_id: string
          expires_at: string
          nonce: string
        }
        Insert: {
          created_at?: string
          device_id: string
          expires_at: string
          nonce: string
        }
        Update: {
          created_at?: string
          device_id?: string
          expires_at?: string
          nonce?: string
        }
        Relationships: [
          {
            foreignKeyName: 'timeclock_qr_nonces_device_id_fkey'
            columns: ['device_id']
            isOneToOne: false
            referencedRelation: 'timeclock_devices'
            referencedColumns: ['id']
          },
        ]
      }
      training_attempts: {
        Row: {
          answers: Json
          course_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          passed: boolean
          score: number
        }
        Insert: {
          answers?: Json
          course_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          passed?: boolean
          score: number
        }
        Update: {
          answers?: Json
          course_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          passed?: boolean
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: 'training_attempts_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'training_courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'training_attempts_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      training_certificates: {
        Row: {
          certificate_number: string
          created_at: string
          enrollment_id: string
          expires_at: string | null
          id: string
          issued_at: string
        }
        Insert: {
          certificate_number: string
          created_at?: string
          enrollment_id: string
          expires_at?: string | null
          id?: string
          issued_at?: string
        }
        Update: {
          certificate_number?: string
          created_at?: string
          enrollment_id?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'training_certificates_enrollment_id_fkey'
            columns: ['enrollment_id']
            isOneToOne: true
            referencedRelation: 'training_enrollments'
            referencedColumns: ['id']
          },
        ]
      }
      training_courses: {
        Row: {
          category: string
          certificate_valid_days: number | null
          created_at: string
          created_by: string | null
          description: string
          estimated_minutes: number
          id: string
          is_active: boolean
          is_required: boolean
          passing_score: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          certificate_valid_days?: number | null
          created_at?: string
          created_by?: string | null
          description?: string
          estimated_minutes?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          passing_score?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          certificate_valid_days?: number | null
          created_at?: string
          created_by?: string | null
          description?: string
          estimated_minutes?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          passing_score?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_enrollments: {
        Row: {
          assigned_by: string | null
          certificate_expires_at: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          due_date: string | null
          due_reminder_sent_at: string | null
          employee_id: string
          expiry_reminder_sent_at: string | null
          id: string
          score: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          certificate_expires_at?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_date?: string | null
          due_reminder_sent_at?: string | null
          employee_id: string
          expiry_reminder_sent_at?: string | null
          id?: string
          score?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          certificate_expires_at?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_date?: string | null
          due_reminder_sent_at?: string | null
          employee_id?: string
          expiry_reminder_sent_at?: string | null
          id?: string
          score?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'training_enrollments_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'training_courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'training_enrollments_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      training_lessons: {
        Row: {
          body: string
          course_id: string
          created_at: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          course_id: string
          created_at?: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          course_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'training_lessons_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'training_courses'
            referencedColumns: ['id']
          },
        ]
      }
      training_quiz_questions: {
        Row: {
          correct_answer: Json
          correct_option_index: number
          course_id: string
          created_at: string
          explanation: string | null
          id: string
          image_url: string | null
          options: Json
          points: number
          prompt: string
          question_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          correct_answer?: Json
          correct_option_index?: number
          course_id: string
          created_at?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          options?: Json
          points?: number
          prompt: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          correct_answer?: Json
          correct_option_index?: number
          course_id?: string
          created_at?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          options?: Json
          points?: number
          prompt?: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'training_quiz_questions_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'training_courses'
            referencedColumns: ['id']
          },
        ]
      }
      transaction_methods: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      travel_package_audit_events: {
        Row: {
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          event_summary: string
          event_type: string
          id: string
          metadata: Json
          package_id: string | null
          quote_id: string | null
        }
        Insert: {
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          event_summary: string
          event_type: string
          id?: string
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
        }
        Update: {
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          event_summary?: string
          event_type?: string
          id?: string
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_audit_events_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_audit_events_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_communications: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          direction: string
          follow_up_due_at: string | null
          follow_up_required: boolean
          id: string
          invoice_id: string | null
          metadata: Json
          package_id: string | null
          quote_id: string | null
          reservation_id: string | null
          summary: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          follow_up_due_at?: string | null
          follow_up_required?: boolean
          id?: string
          invoice_id?: string | null
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
          reservation_id?: string | null
          summary: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          follow_up_due_at?: string | null
          follow_up_required?: boolean
          id?: string
          invoice_id?: string | null
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
          reservation_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_communications_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'travel_package_invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_communications_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_communications_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_communications_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_deadlines: {
        Row: {
          assigned_to: string | null
          created_at: string
          deadline_type: string
          due_at: string
          id: string
          invoice_id: string | null
          metadata: Json
          notes: string | null
          package_id: string | null
          quote_id: string | null
          reminder_sent_at: string | null
          reservation_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          deadline_type: string
          due_at: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
          notes?: string | null
          package_id?: string | null
          quote_id?: string | null
          reminder_sent_at?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          deadline_type?: string
          due_at?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
          notes?: string | null
          package_id?: string | null
          quote_id?: string | null
          reminder_sent_at?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_deadlines_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'travel_package_invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_deadlines_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_deadlines_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_deadlines_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_documents: {
        Row: {
          backup_bucket: string | null
          backup_error: string | null
          backup_key: string | null
          backup_provider: string | null
          backup_status: string
          category: string
          created_at: string
          customer_visible: boolean
          deleted_at: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          internal_notes: string | null
          invoice_id: string | null
          metadata: Json
          package_id: string
          public_notes: string | null
          quote_id: string | null
          released_at: string | null
          released_by: string | null
          reservation_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          storage_bucket: string
          storage_etag: string
          storage_key: string
          storage_provider: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          backup_bucket?: string | null
          backup_error?: string | null
          backup_key?: string | null
          backup_provider?: string | null
          backup_status?: string
          category?: string
          created_at?: string
          customer_visible?: boolean
          deleted_at?: string | null
          file_name: string
          file_size?: number
          file_type?: string
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          metadata?: Json
          package_id: string
          public_notes?: string | null
          quote_id?: string | null
          released_at?: string | null
          released_by?: string | null
          reservation_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          storage_bucket: string
          storage_etag?: string
          storage_key: string
          storage_provider?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          backup_bucket?: string | null
          backup_error?: string | null
          backup_key?: string | null
          backup_provider?: string | null
          backup_status?: string
          category?: string
          created_at?: string
          customer_visible?: boolean
          deleted_at?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          metadata?: Json
          package_id?: string
          public_notes?: string | null
          quote_id?: string | null
          released_at?: string | null
          released_by?: string | null
          reservation_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          storage_bucket?: string
          storage_etag?: string
          storage_key?: string
          storage_provider?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_documents_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'travel_package_invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_documents_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_documents_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_documents_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_group_members: {
        Row: {
          created_at: string
          customer_display_name: string | null
          customer_visible: boolean
          family_label: string
          group_id: string
          id: string
          is_lead_family: boolean
          metadata: Json
          package_id: string | null
          quote_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_display_name?: string | null
          customer_visible?: boolean
          family_label?: string
          group_id: string
          id?: string
          is_lead_family?: boolean
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_display_name?: string | null
          customer_visible?: boolean
          family_label?: string
          group_id?: string
          id?: string
          is_lead_family?: boolean
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_group_members_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_group_members_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_group_service_allocations: {
        Row: {
          allocated_cost: number
          allocated_sale_value: number
          allocation_mode: string
          created_at: string
          group_id: string
          id: string
          internal_notes: string | null
          metadata: Json
          package_id: string | null
          passenger_count: number
          quote_id: string | null
          shared_service_id: string
          updated_at: string
        }
        Insert: {
          allocated_cost?: number
          allocated_sale_value?: number
          allocation_mode?: string
          created_at?: string
          group_id: string
          id?: string
          internal_notes?: string | null
          metadata?: Json
          package_id?: string | null
          passenger_count?: number
          quote_id?: string | null
          shared_service_id: string
          updated_at?: string
        }
        Update: {
          allocated_cost?: number
          allocated_sale_value?: number
          allocation_mode?: string
          created_at?: string
          group_id?: string
          id?: string
          internal_notes?: string | null
          metadata?: Json
          package_id?: string | null
          passenger_count?: number
          quote_id?: string | null
          shared_service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_group_service_allocations_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_group_service_allocations_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_group_service_allocations_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_group_service_allocations_shared_service_id_fkey'
            columns: ['shared_service_id']
            isOneToOne: false
            referencedRelation: 'travel_package_group_shared_services'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_group_shared_services: {
        Row: {
          allocation_mode: string
          allocation_payload: Json
          archived_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_note: string
          customer_visible: boolean
          description: string | null
          group_id: string
          id: string
          internal_total_cost: number
          metadata: Json
          service_type: string
          status: string
          supplier_name: string | null
          supplier_reference: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allocation_mode?: string
          allocation_payload?: Json
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_note?: string
          customer_visible?: boolean
          description?: string | null
          group_id: string
          id?: string
          internal_total_cost?: number
          metadata?: Json
          service_type?: string
          status?: string
          supplier_name?: string | null
          supplier_reference?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allocation_mode?: string
          allocation_payload?: Json
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_note?: string
          customer_visible?: boolean
          description?: string | null
          group_id?: string
          id?: string
          internal_total_cost?: number
          metadata?: Json
          service_type?: string
          status?: string
          supplier_name?: string | null
          supplier_reference?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_group_shared_services_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_groups: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          customer_file_created_at: string | null
          customer_file_mode: string
          customer_package_id: string | null
          customer_visibility_mode: string
          group_reference: string
          id: string
          internal_notes: string | null
          lead_package_id: string | null
          lead_quote_id: string | null
          metadata: Json
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_file_created_at?: string | null
          customer_file_mode?: string
          customer_package_id?: string | null
          customer_visibility_mode?: string
          group_reference?: string
          id?: string
          internal_notes?: string | null
          lead_package_id?: string | null
          lead_quote_id?: string | null
          metadata?: Json
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_file_created_at?: string | null
          customer_file_mode?: string
          customer_package_id?: string | null
          customer_visibility_mode?: string
          group_reference?: string
          id?: string
          internal_notes?: string | null
          lead_package_id?: string | null
          lead_quote_id?: string | null
          metadata?: Json
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_groups_customer_package_id_fkey'
            columns: ['customer_package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_groups_lead_package_id_fkey'
            columns: ['lead_package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_groups_lead_quote_id_fkey'
            columns: ['lead_quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_installments: {
        Row: {
          amount: number
          created_at: string
          due_on: string
          id: string
          notes: string | null
          package_id: string
          paid_at: string | null
          payment_id: string | null
          plan_id: string
          sequence_number: number
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_on: string
          id?: string
          notes?: string | null
          package_id: string
          paid_at?: string | null
          payment_id?: string | null
          plan_id: string
          sequence_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_on?: string
          id?: string
          notes?: string | null
          package_id?: string
          paid_at?: string | null
          payment_id?: string | null
          plan_id?: string
          sequence_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_installments_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_installments_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: false
            referencedRelation: 'travel_package_payments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_installments_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'travel_package_payment_plans'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_invoice_lines: {
        Row: {
          created_at: string
          customer_visible: boolean
          description: string
          discount_amount: number
          expected_commission: number
          id: string
          invoice_id: string
          line_type: string
          metadata: Json
          package_id: string
          quantity: number
          received_commission: number
          reservation_id: string | null
          reservation_item_id: string | null
          sort_order: number
          total_booked_cost: number
          total_sold_price: number
          unit_booked_cost: number
          unit_sold_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_visible?: boolean
          description: string
          discount_amount?: number
          expected_commission?: number
          id?: string
          invoice_id: string
          line_type?: string
          metadata?: Json
          package_id: string
          quantity?: number
          received_commission?: number
          reservation_id?: string | null
          reservation_item_id?: string | null
          sort_order?: number
          total_booked_cost?: number
          total_sold_price?: number
          unit_booked_cost?: number
          unit_sold_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_visible?: boolean
          description?: string
          discount_amount?: number
          expected_commission?: number
          id?: string
          invoice_id?: string
          line_type?: string
          metadata?: Json
          package_id?: string
          quantity?: number
          received_commission?: number
          reservation_id?: string | null
          reservation_item_id?: string | null
          sort_order?: number
          total_booked_cost?: number
          total_sold_price?: number
          unit_booked_cost?: number
          unit_sold_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_invoice_lines_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'travel_package_invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_invoice_lines_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_invoice_lines_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_invoice_lines_reservation_item_id_fkey'
            columns: ['reservation_item_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservation_items'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_invoices: {
        Row: {
          amendment_reason: string | null
          balance_due: number
          created_at: string
          created_by: string | null
          currency: string
          customer_terms: string | null
          discount_total: number
          due_at: string | null
          expected_commission_total: number
          finalised_at: string | null
          group_member_id: string | null
          id: string
          internal_notes: string | null
          invoice_number: string
          metadata: Json
          package_id: string
          projected_margin: number
          quote_id: string | null
          received_commission_total: number
          released_at: string | null
          released_by: string | null
          released_to_customer: boolean
          released_version: number | null
          status: string
          subtotal_sold: number
          total_booked_cost: number
          total_paid: number
          total_sold: number
          updated_at: string
          updated_by: string | null
          version: number
          voided_at: string | null
        }
        Insert: {
          amendment_reason?: string | null
          balance_due?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_terms?: string | null
          discount_total?: number
          due_at?: string | null
          expected_commission_total?: number
          finalised_at?: string | null
          group_member_id?: string | null
          id?: string
          internal_notes?: string | null
          invoice_number: string
          metadata?: Json
          package_id: string
          projected_margin?: number
          quote_id?: string | null
          received_commission_total?: number
          released_at?: string | null
          released_by?: string | null
          released_to_customer?: boolean
          released_version?: number | null
          status?: string
          subtotal_sold?: number
          total_booked_cost?: number
          total_paid?: number
          total_sold?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          voided_at?: string | null
        }
        Update: {
          amendment_reason?: string | null
          balance_due?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_terms?: string | null
          discount_total?: number
          due_at?: string | null
          expected_commission_total?: number
          finalised_at?: string | null
          group_member_id?: string | null
          id?: string
          internal_notes?: string | null
          invoice_number?: string
          metadata?: Json
          package_id?: string
          projected_margin?: number
          quote_id?: string | null
          received_commission_total?: number
          released_at?: string | null
          released_by?: string | null
          released_to_customer?: boolean
          released_version?: number | null
          status?: string
          subtotal_sold?: number
          total_booked_cost?: number
          total_paid?: number
          total_sold?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_invoices_group_member_id_fkey'
            columns: ['group_member_id']
            isOneToOne: false
            referencedRelation: 'travel_package_group_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_invoices_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_invoices_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_legacy_migration_map: {
        Row: {
          created_at: string
          error_message: string | null
          failed_documents_count: number
          id: string
          legacy_customer_id: string
          legacy_reference_number: string | null
          migrated_at: string | null
          migrated_documents_count: number
          migration_run_id: string | null
          migration_status: string
          package_id: string | null
          source_payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_documents_count?: number
          id?: string
          legacy_customer_id: string
          legacy_reference_number?: string | null
          migrated_at?: string | null
          migrated_documents_count?: number
          migration_run_id?: string | null
          migration_status?: string
          package_id?: string | null
          source_payload?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_documents_count?: number
          id?: string
          legacy_customer_id?: string
          legacy_reference_number?: string | null
          migrated_at?: string | null
          migrated_documents_count?: number
          migration_run_id?: string | null
          migration_status?: string
          package_id?: string | null
          source_payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_legacy_migration_map_migration_run_id_fkey'
            columns: ['migration_run_id']
            isOneToOne: false
            referencedRelation: 'travel_package_legacy_migration_runs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_legacy_migration_map_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_legacy_migration_runs: {
        Row: {
          completed_at: string | null
          copied_document_count: number
          created_at: string
          document_count: number
          error_message: string | null
          failed_count: number
          failed_document_count: number
          id: string
          imported_count: number
          mode: string
          report: Json
          skipped_count: number
          source_count: number
          source_cursor: string | null
          started_at: string | null
          started_by: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          copied_document_count?: number
          created_at?: string
          document_count?: number
          error_message?: string | null
          failed_count?: number
          failed_document_count?: number
          id?: string
          imported_count?: number
          mode?: string
          report?: Json
          skipped_count?: number
          source_count?: number
          source_cursor?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          copied_document_count?: number
          created_at?: string
          document_count?: number
          error_message?: string | null
          failed_count?: number
          failed_document_count?: number
          id?: string
          imported_count?: number
          mode?: string
          report?: Json
          skipped_count?: number
          source_count?: number
          source_cursor?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
        }
        Relationships: []
      }
      travel_package_passengers: {
        Row: {
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          first_name: string | null
          group_member_id: string | null
          id: string
          internal_notes: string | null
          last_name: string | null
          package_id: string
          passenger_type: string
          passport_checked: boolean
          passport_issue_note: string | null
          passport_received: boolean
          quote_id: string | null
          room_allocation: string | null
          ticket_status: string
          updated_at: string
          updated_by: string | null
          visa_status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          first_name?: string | null
          group_member_id?: string | null
          id?: string
          internal_notes?: string | null
          last_name?: string | null
          package_id: string
          passenger_type?: string
          passport_checked?: boolean
          passport_issue_note?: string | null
          passport_received?: boolean
          quote_id?: string | null
          room_allocation?: string | null
          ticket_status?: string
          updated_at?: string
          updated_by?: string | null
          visa_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          first_name?: string | null
          group_member_id?: string | null
          id?: string
          internal_notes?: string | null
          last_name?: string | null
          package_id?: string
          passenger_type?: string
          passport_checked?: boolean
          passport_issue_note?: string | null
          passport_received?: boolean
          quote_id?: string | null
          room_allocation?: string | null
          ticket_status?: string
          updated_at?: string
          updated_by?: string | null
          visa_status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_passengers_group_member_id_fkey'
            columns: ['group_member_id']
            isOneToOne: false
            referencedRelation: 'travel_package_group_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_passengers_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_passengers_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_payment_plans: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          deposit_amount: number
          frequency: string
          id: string
          internal_notes: string | null
          invoice_id: string | null
          lms_plan_id: string | null
          package_id: string
          starts_on: string | null
          status: string
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_amount?: number
          frequency?: string
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          lms_plan_id?: string | null
          package_id: string
          starts_on?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_amount?: number
          frequency?: string
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          lms_plan_id?: string | null
          package_id?: string
          starts_on?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_payment_plans_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'travel_package_invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_payment_plans_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          group_member_id: string | null
          id: string
          invoice_id: string | null
          metadata: Json
          notes: string | null
          package_id: string
          payment_method: string
          payment_status: string
          payment_type: string
          quote_id: string | null
          receipt_document_id: string | null
          receipt_reference: string | null
          received_at: string | null
          received_by: string | null
          requested_at: string | null
          reservation_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          group_member_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          notes?: string | null
          package_id: string
          payment_method?: string
          payment_status?: string
          payment_type?: string
          quote_id?: string | null
          receipt_document_id?: string | null
          receipt_reference?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string | null
          reservation_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          group_member_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          notes?: string | null
          package_id?: string
          payment_method?: string
          payment_status?: string
          payment_type?: string
          quote_id?: string | null
          receipt_document_id?: string | null
          receipt_reference?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string | null
          reservation_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_payments_group_member_id_fkey'
            columns: ['group_member_id']
            isOneToOne: false
            referencedRelation: 'travel_package_group_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_payments_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'travel_package_invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_payments_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_payments_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_payments_receipt_document_id_fkey'
            columns: ['receipt_document_id']
            isOneToOne: false
            referencedRelation: 'travel_package_documents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_payments_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_portal_access_attempts: {
        Row: {
          created_at: string
          id: string
          ip_hash: string
          package_reference: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash: string
          package_reference?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string
          package_reference?: string | null
          success?: boolean
        }
        Relationships: []
      }
      travel_package_quotes: {
        Row: {
          agent_selection_note: string | null
          archived_at: string | null
          converted_at: string | null
          converted_package_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_selection_note: string | null
          expires_at: string
          finalised_at: string | null
          finalised_by: string | null
          finalised_source: string | null
          id: string
          last_shared_by: string | null
          location_id: string | null
          package_type: string
          payload: Json
          selected_at: string | null
          selected_option: Json | null
          selection_note: string | null
          share_enabled: boolean
          share_token: string
          shared_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_selection_note?: string | null
          archived_at?: string | null
          converted_at?: string | null
          converted_package_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_selection_note?: string | null
          expires_at?: string
          finalised_at?: string | null
          finalised_by?: string | null
          finalised_source?: string | null
          id?: string
          last_shared_by?: string | null
          location_id?: string | null
          package_type?: string
          payload?: Json
          selected_at?: string | null
          selected_option?: Json | null
          selection_note?: string | null
          share_enabled?: boolean
          share_token: string
          shared_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_selection_note?: string | null
          archived_at?: string | null
          converted_at?: string | null
          converted_package_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_selection_note?: string | null
          expires_at?: string
          finalised_at?: string | null
          finalised_by?: string | null
          finalised_source?: string | null
          id?: string
          last_shared_by?: string | null
          location_id?: string | null
          package_type?: string
          payload?: Json
          selected_at?: string | null
          selected_option?: Json | null
          selection_note?: string | null
          share_enabled?: boolean
          share_token?: string
          shared_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_quotes_converted_package_id_fkey'
            columns: ['converted_package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_quotes_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_reservation_items: {
        Row: {
          commission_expected_amount: number
          commission_received_amount: number
          created_at: string
          currency: string
          description: string | null
          discount_amount: number
          ends_at: string | null
          id: string
          item_type: string
          metadata: Json
          package_id: string
          quantity: number
          reservation_id: string
          starts_at: string | null
          status: string
          supplier_reference: string | null
          title: string
          total_booked_cost: number
          total_sold_price: number
          unit_booked_cost: number
          unit_sold_price: number
          updated_at: string
        }
        Insert: {
          commission_expected_amount?: number
          commission_received_amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          discount_amount?: number
          ends_at?: string | null
          id?: string
          item_type?: string
          metadata?: Json
          package_id: string
          quantity?: number
          reservation_id: string
          starts_at?: string | null
          status?: string
          supplier_reference?: string | null
          title: string
          total_booked_cost?: number
          total_sold_price?: number
          unit_booked_cost?: number
          unit_sold_price?: number
          updated_at?: string
        }
        Update: {
          commission_expected_amount?: number
          commission_received_amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          discount_amount?: number
          ends_at?: string | null
          id?: string
          item_type?: string
          metadata?: Json
          package_id?: string
          quantity?: number
          reservation_id?: string
          starts_at?: string | null
          status?: string
          supplier_reference?: string | null
          title?: string
          total_booked_cost?: number
          total_sold_price?: number
          unit_booked_cost?: number
          unit_sold_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_reservation_items_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_reservation_items_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_reservation_items_reservation_package_fk'
            columns: ['reservation_id', 'package_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id', 'package_id']
          },
        ]
      }
      travel_package_reservations: {
        Row: {
          booked_cost_total: number
          booking_reference: string | null
          cancelled_at: string | null
          commission_expected_total: number
          commission_received_total: number
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_refund_total: number
          customer_visible: boolean
          deposit_amount: number
          deposit_due_at: string | null
          deposit_required: boolean
          discount_total: number
          group_member_id: string | null
          id: string
          internal_notes: string | null
          last_refund_reason: string | null
          last_refunded_at: string | null
          metadata: Json
          normalized_booking_reference: string | null
          package_id: string
          payment_due_at: string | null
          public_notes: string | null
          quote_id: string | null
          reservation_type: string
          reserved_at: string | null
          sold_price_total: number
          status: string
          supplier_name: string | null
          supplier_reference: string | null
          supplier_refund_total: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booked_cost_total?: number
          booking_reference?: string | null
          cancelled_at?: string | null
          commission_expected_total?: number
          commission_received_total?: number
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_refund_total?: number
          customer_visible?: boolean
          deposit_amount?: number
          deposit_due_at?: string | null
          deposit_required?: boolean
          discount_total?: number
          group_member_id?: string | null
          id?: string
          internal_notes?: string | null
          last_refund_reason?: string | null
          last_refunded_at?: string | null
          metadata?: Json
          normalized_booking_reference?: string | null
          package_id: string
          payment_due_at?: string | null
          public_notes?: string | null
          quote_id?: string | null
          reservation_type?: string
          reserved_at?: string | null
          sold_price_total?: number
          status?: string
          supplier_name?: string | null
          supplier_reference?: string | null
          supplier_refund_total?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booked_cost_total?: number
          booking_reference?: string | null
          cancelled_at?: string | null
          commission_expected_total?: number
          commission_received_total?: number
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_refund_total?: number
          customer_visible?: boolean
          deposit_amount?: number
          deposit_due_at?: string | null
          deposit_required?: boolean
          discount_total?: number
          group_member_id?: string | null
          id?: string
          internal_notes?: string | null
          last_refund_reason?: string | null
          last_refunded_at?: string | null
          metadata?: Json
          normalized_booking_reference?: string | null
          package_id?: string
          payment_due_at?: string | null
          public_notes?: string | null
          quote_id?: string | null
          reservation_type?: string
          reserved_at?: string | null
          sold_price_total?: number
          status?: string
          supplier_name?: string | null
          supplier_reference?: string | null
          supplier_refund_total?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_reservations_group_member_id_fkey'
            columns: ['group_member_id']
            isOneToOne: false
            referencedRelation: 'travel_package_group_members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_reservations_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_reservations_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_risk_flags: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          assigned_to: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          metadata: Json
          package_id: string | null
          quote_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          risk_type: string
          severity: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_type: string
          severity?: string
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          package_id?: string | null
          quote_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_type?: string
          severity?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_risk_flags_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_risk_flags_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_tasks: {
        Row: {
          assigned_to: string | null
          auto_generated: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          invoice_id: string | null
          metadata: Json
          package_id: string | null
          priority: string
          quote_id: string | null
          reservation_id: string | null
          source_rule: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_generated?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          package_id?: string | null
          priority?: string
          quote_id?: string | null
          reservation_id?: string | null
          source_rule?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_generated?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          package_id?: string | null
          priority?: string
          quote_id?: string | null
          reservation_id?: string | null
          source_rule?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_tasks_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'travel_package_invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_tasks_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_tasks_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_tasks_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_third_party_access_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          package_id: string
          recipient_name: string | null
          share_id: string
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          package_id: string
          recipient_name?: string | null
          share_id: string
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          package_id?: string
          recipient_name?: string | null
          share_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_third_party_access_events_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_third_party_access_events_share_id_fkey'
            columns: ['share_id']
            isOneToOne: false
            referencedRelation: 'travel_package_third_party_document_shares'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_third_party_document_shares: {
        Row: {
          access_code_hash: string
          access_code_hint: string
          allowed_categories: string[]
          created_at: string
          created_by: string | null
          expires_at: string
          failed_access_count: number
          id: string
          label: string
          last_access_ip_hash: string | null
          last_accessed_at: string | null
          last_failed_at: string | null
          metadata: Json
          package_id: string
          purpose: string | null
          recipient_name: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          terms_accepted_at: string | null
          terms_accepted_by: string | null
          terms_text: string
          token_hash: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access_code_hash: string
          access_code_hint?: string
          allowed_categories?: string[]
          created_at?: string
          created_by?: string | null
          expires_at: string
          failed_access_count?: number
          id?: string
          label?: string
          last_access_ip_hash?: string | null
          last_accessed_at?: string | null
          last_failed_at?: string | null
          metadata?: Json
          package_id: string
          purpose?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          terms_accepted_at?: string | null
          terms_accepted_by?: string | null
          terms_text: string
          token_hash: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access_code_hash?: string
          access_code_hint?: string
          allowed_categories?: string[]
          created_at?: string
          created_by?: string | null
          expires_at?: string
          failed_access_count?: number
          id?: string
          label?: string
          last_access_ip_hash?: string | null
          last_accessed_at?: string | null
          last_failed_at?: string | null
          metadata?: Json
          package_id?: string
          purpose?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          terms_accepted_at?: string | null
          terms_accepted_by?: string | null
          terms_text?: string
          token_hash?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_third_party_document_shares_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_transport_vouchers: {
        Row: {
          created_at: string
          created_by: string | null
          customer_visible: boolean
          document_id: string | null
          generated_at: string | null
          id: string
          package_id: string
          released_at: string | null
          released_by: string | null
          rendered_html: string | null
          reservation_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
          voucher_data: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_visible?: boolean
          document_id?: string | null
          generated_at?: string | null
          id?: string
          package_id: string
          released_at?: string | null
          released_by?: string | null
          rendered_html?: string | null
          reservation_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          voucher_data?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_visible?: boolean
          document_id?: string | null
          generated_at?: string | null
          id?: string
          package_id?: string
          released_at?: string | null
          released_by?: string | null
          rendered_html?: string | null
          reservation_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          voucher_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_transport_vouchers_document_id_fkey'
            columns: ['document_id']
            isOneToOne: false
            referencedRelation: 'travel_package_documents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_transport_vouchers_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_transport_vouchers_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
        ]
      }
      travel_package_versions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_change_summary: string | null
          id: string
          internal_change_summary: string | null
          object_id: string | null
          object_type: string
          package_id: string | null
          quote_id: string | null
          released_at: string | null
          released_by: string | null
          snapshot: Json
          version_number: number
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_change_summary?: string | null
          id?: string
          internal_change_summary?: string | null
          object_id?: string | null
          object_type: string
          package_id?: string | null
          quote_id?: string | null
          released_at?: string | null
          released_by?: string | null
          snapshot?: Json
          version_number?: number
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_change_summary?: string | null
          id?: string
          internal_change_summary?: string | null
          object_id?: string | null
          object_type?: string
          package_id?: string | null
          quote_id?: string | null
          released_at?: string | null
          released_by?: string | null
          snapshot?: Json
          version_number?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_package_versions_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_package_versions_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      travel_packages: {
        Row: {
          archived_at: string | null
          assigned_agent_id: string | null
          booking_responsible_employee_id: string | null
          cancellation_reason: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          current_public_summary: Json
          customer_access_last_name: string | null
          customer_email: string | null
          customer_file_mode: string
          customer_name: string | null
          customer_phone: string | null
          departure_date: string | null
          destination: string | null
          document_access_enabled: boolean
          document_access_expires_at: string | null
          document_access_last_viewed_at: string | null
          document_access_token: string | null
          document_release_status: string
          earned_at: string | null
          group_id: string | null
          id: string
          invoice_status: string
          location_id: string | null
          metadata: Json
          minio_bucket: string | null
          minio_prefix: string | null
          modify_responsible_employee_id: string | null
          next_action: string | null
          next_action_due_at: string | null
          package_reference: string
          package_type: string
          passenger_summary: Json
          passport_status: string
          payment_status: string
          portal_access_created_at: string | null
          return_date: string | null
          returned_at: string | null
          risk_level: string
          sales_employee_id: string | null
          sales_responsible_employee_id: string | null
          selected_quote_snapshot: Json
          service_responsible_employee_id: string | null
          source_quote_id: string | null
          status: string
          travelled_at: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          booking_responsible_employee_id?: string | null
          cancellation_reason?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_public_summary?: Json
          customer_access_last_name?: string | null
          customer_email?: string | null
          customer_file_mode?: string
          customer_name?: string | null
          customer_phone?: string | null
          departure_date?: string | null
          destination?: string | null
          document_access_enabled?: boolean
          document_access_expires_at?: string | null
          document_access_last_viewed_at?: string | null
          document_access_token?: string | null
          document_release_status?: string
          earned_at?: string | null
          group_id?: string | null
          id?: string
          invoice_status?: string
          location_id?: string | null
          metadata?: Json
          minio_bucket?: string | null
          minio_prefix?: string | null
          modify_responsible_employee_id?: string | null
          next_action?: string | null
          next_action_due_at?: string | null
          package_reference: string
          package_type?: string
          passenger_summary?: Json
          passport_status?: string
          payment_status?: string
          portal_access_created_at?: string | null
          return_date?: string | null
          returned_at?: string | null
          risk_level?: string
          sales_employee_id?: string | null
          sales_responsible_employee_id?: string | null
          selected_quote_snapshot?: Json
          service_responsible_employee_id?: string | null
          source_quote_id?: string | null
          status?: string
          travelled_at?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          booking_responsible_employee_id?: string | null
          cancellation_reason?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_public_summary?: Json
          customer_access_last_name?: string | null
          customer_email?: string | null
          customer_file_mode?: string
          customer_name?: string | null
          customer_phone?: string | null
          departure_date?: string | null
          destination?: string | null
          document_access_enabled?: boolean
          document_access_expires_at?: string | null
          document_access_last_viewed_at?: string | null
          document_access_token?: string | null
          document_release_status?: string
          earned_at?: string | null
          group_id?: string | null
          id?: string
          invoice_status?: string
          location_id?: string | null
          metadata?: Json
          minio_bucket?: string | null
          minio_prefix?: string | null
          modify_responsible_employee_id?: string | null
          next_action?: string | null
          next_action_due_at?: string | null
          package_reference?: string
          package_type?: string
          passenger_summary?: Json
          passport_status?: string
          payment_status?: string
          portal_access_created_at?: string | null
          return_date?: string | null
          returned_at?: string | null
          risk_level?: string
          sales_employee_id?: string | null
          sales_responsible_employee_id?: string | null
          selected_quote_snapshot?: Json
          service_responsible_employee_id?: string | null
          source_quote_id?: string | null
          status?: string
          travelled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'travel_packages_booking_responsible_employee_id_fkey'
            columns: ['booking_responsible_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_packages_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_packages_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_packages_modify_responsible_employee_id_fkey'
            columns: ['modify_responsible_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_packages_sales_employee_id_fkey'
            columns: ['sales_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_packages_sales_responsible_employee_id_fkey'
            columns: ['sales_responsible_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_packages_service_responsible_employee_id_fkey'
            columns: ['service_responsible_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'travel_packages_source_quote_id_fkey'
            columns: ['source_quote_id']
            isOneToOne: false
            referencedRelation: 'travel_package_quotes'
            referencedColumns: ['id']
          },
        ]
      }
      umrah_transport_guide_rates: {
        Row: {
          cost_price: number
          created_at: string
          currency: string
          guide_service: string
          id: string
          is_active: boolean
          notes: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          currency?: string
          guide_service: string
          id?: string
          is_active?: boolean
          notes?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          currency?: string
          guide_service?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'umrah_transport_guide_rates_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_suppliers'
            referencedColumns: ['id']
          },
        ]
      }
      umrah_transport_rates: {
        Row: {
          cost_price: number
          created_at: string
          currency: string
          id: string
          is_active: boolean
          notes: string | null
          route_id: string
          supplier_id: string
          updated_at: string
          vehicle_type_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          route_id: string
          supplier_id: string
          updated_at?: string
          vehicle_type_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          route_id?: string
          supplier_id?: string
          updated_at?: string
          vehicle_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'umrah_transport_rates_route_id_fkey'
            columns: ['route_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_routes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'umrah_transport_rates_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_suppliers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'umrah_transport_rates_vehicle_type_id_fkey'
            columns: ['vehicle_type_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_vehicle_types'
            referencedColumns: ['id']
          },
        ]
      }
      umrah_transport_route_plan_segments: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          route_id: string
          segment_label: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          route_id: string
          segment_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          route_id?: string
          segment_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'umrah_transport_route_plan_segments_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_route_plans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'umrah_transport_route_plan_segments_route_id_fkey'
            columns: ['route_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_routes'
            referencedColumns: ['id']
          },
        ]
      }
      umrah_transport_route_plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          plan_name: string
          preferred_supplier_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_name: string
          preferred_supplier_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_name?: string
          preferred_supplier_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'umrah_transport_route_plans_preferred_supplier_id_fkey'
            columns: ['preferred_supplier_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_suppliers'
            referencedColumns: ['id']
          },
        ]
      }
      umrah_transport_routes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          preferred_supplier_id: string | null
          route_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          preferred_supplier_id?: string | null
          route_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          preferred_supplier_id?: string | null
          route_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'umrah_transport_routes_preferred_supplier_id_fkey'
            columns: ['preferred_supplier_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_suppliers'
            referencedColumns: ['id']
          },
        ]
      }
      umrah_transport_settings: {
        Row: {
          created_at: string
          notes: string | null
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          setting_key: string
          setting_value?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      umrah_transport_supplier_vehicle_labels: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          passenger_capacity_label: string | null
          supplier_id: string
          transport_label: string | null
          updated_at: string
          vehicle_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          passenger_capacity_label?: string | null
          supplier_id: string
          transport_label?: string | null
          updated_at?: string
          vehicle_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          passenger_capacity_label?: string | null
          supplier_id?: string
          transport_label?: string | null
          updated_at?: string
          vehicle_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'umrah_transport_supplier_vehicle_labels_supplier_id_fkey'
            columns: ['supplier_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_suppliers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'umrah_transport_supplier_vehicle_labels_vehicle_type_id_fkey'
            columns: ['vehicle_type_id']
            isOneToOne: false
            referencedRelation: 'umrah_transport_vehicle_types'
            referencedColumns: ['id']
          },
        ]
      }
      umrah_transport_suppliers: {
        Row: {
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_currency: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      umrah_transport_vehicle_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          notes: string | null
          passenger_capacity: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          passenger_capacity?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          passenger_capacity?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_passkey_challenges: {
        Row: {
          challenge: string
          consumed_at: string | null
          created_at: string | null
          expires_at: string
          id: string
          type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          challenge: string
          consumed_at?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          challenge?: string
          consumed_at?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_passkeys: {
        Row: {
          created_at: string | null
          credential_id: string
          device_type: string | null
          id: string
          last_used_at: string | null
          name: string
          public_key_jwk: Json
          sign_count: number
          transports: string[]
          updated_at: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credential_id: string
          device_type?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          public_key_jwk: Json
          sign_count?: number
          transports?: string[]
          updated_at?: string | null
          user_email: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          credential_id?: string
          device_type?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          public_key_jwk?: Json
          sign_count?: number
          transports?: string[]
          updated_at?: string | null
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      user_security_preferences: {
        Row: {
          backup_codes_downloaded_at: string | null
          backup_reminder_dismissed_until: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          backup_codes_downloaded_at?: string | null
          backup_reminder_dismissed_until?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          backup_codes_downloaded_at?: string | null
          backup_reminder_dismissed_until?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      visa_applications: {
        Row: {
          applicant_id: string
          application_date: string
          base_price: number | null
          cost_currency: string | null
          created_at: string
          customer_price: number | null
          employee_id: string
          external_application_number: string | null
          id: string
          internal_tracking_number: string
          is_loyalty_claimed: boolean
          is_part_of_package: boolean | null
          notes: string | null
          package_id: string | null
          passport_number_used: string | null
          status: Database['public']['Enums']['application_status']
          validity: string | null
          visa_country_id: string
          visa_type_id: string
        }
        Insert: {
          applicant_id: string
          application_date?: string
          base_price?: number | null
          cost_currency?: string | null
          created_at?: string
          customer_price?: number | null
          employee_id: string
          external_application_number?: string | null
          id?: string
          internal_tracking_number: string
          is_loyalty_claimed?: boolean
          is_part_of_package?: boolean | null
          notes?: string | null
          package_id?: string | null
          passport_number_used?: string | null
          status?: Database['public']['Enums']['application_status']
          validity?: string | null
          visa_country_id: string
          visa_type_id: string
        }
        Update: {
          applicant_id?: string
          application_date?: string
          base_price?: number | null
          cost_currency?: string | null
          created_at?: string
          customer_price?: number | null
          employee_id?: string
          external_application_number?: string | null
          id?: string
          internal_tracking_number?: string
          is_loyalty_claimed?: boolean
          is_part_of_package?: boolean | null
          notes?: string | null
          package_id?: string | null
          passport_number_used?: string | null
          status?: Database['public']['Enums']['application_status']
          validity?: string | null
          visa_country_id?: string
          visa_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visa_applications_applicant_id_fkey'
            columns: ['applicant_id']
            isOneToOne: false
            referencedRelation: 'applicants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visa_applications_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visa_applications_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visa_applications_visa_country_id_fkey'
            columns: ['visa_country_id']
            isOneToOne: false
            referencedRelation: 'visa_countries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visa_applications_visa_type_id_fkey'
            columns: ['visa_type_id']
            isOneToOne: false
            referencedRelation: 'visa_types'
            referencedColumns: ['id']
          },
        ]
      }
      visa_countries: {
        Row: {
          code: string | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      visa_pricing: {
        Row: {
          cost_price: number | null
          country: string
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          sale_price: number | null
          updated_at: string | null
          visa_type: string
        }
        Insert: {
          cost_price?: number | null
          country: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          sale_price?: number | null
          updated_at?: string | null
          visa_type: string
        }
        Update: {
          cost_price?: number | null
          country?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          sale_price?: number | null
          updated_at?: string | null
          visa_type?: string
        }
        Relationships: []
      }
      visa_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string
          old_status: string | null
          visa_application_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status: string
          old_status?: string | null
          visa_application_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string
          old_status?: string | null
          visa_application_id?: string
        }
        Relationships: []
      }
      visa_types: {
        Row: {
          allowed_nationalities: string[] | null
          country_id: string | null
          default_cost: number | null
          default_price: number | null
          default_validity: string | null
          id: string
          name: string
        }
        Insert: {
          allowed_nationalities?: string[] | null
          country_id?: string | null
          default_cost?: number | null
          default_price?: number | null
          default_validity?: string | null
          id?: string
          name: string
        }
        Update: {
          allowed_nationalities?: string[] | null
          country_id?: string | null
          default_cost?: number | null
          default_price?: number | null
          default_validity?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visa_types_country_id_fkey'
            columns: ['country_id']
            isOneToOne: false
            referencedRelation: 'visa_countries'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      ticket_active_schedule_changes: {
        Row: {
          change_case_id: string | null
          event_version: number | null
          mark_reason: string | null
          marked_at: string | null
          marked_by_employee_id: string | null
          marked_by_employee_name: string | null
          proposed_schedule: Json | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          reviewed_by_employee_name: string | null
          sector_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_schedule_events_actor_employee_id_fkey'
            columns: ['reviewed_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_schedule_events_actor_employee_id_fkey'
            columns: ['marked_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_schedule_events_sector_id_fkey'
            columns: ['sector_id']
            isOneToOne: false
            referencedRelation: 'ticket_itinerary_sectors'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_booking_current_attribution: {
        Row: {
          assistant_employee_ids: string[] | null
          attribution_id: string | null
          attribution_version: number | null
          booking_id: string | null
          changed_by_employee_id: string | null
          created_at: string | null
          entered_by_employee_id: string | null
          primary_employee_id: string | null
          reason: string | null
          root_transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_booking_attribution_versions_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_changed_by_employee_id_fkey'
            columns: ['changed_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_entered_by_employee_id_fkey'
            columns: ['entered_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_primary_employee_id_fkey'
            columns: ['primary_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_booking_attribution_versions_root_booking_fkey'
            columns: ['root_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
        ]
      }
      ticket_fare_adjustment_current: {
        Row: {
          acting_employee_id: string | null
          actor_location_id: string | null
          booking_id: string | null
          booking_location_id: string | null
          commission_scope: string | null
          created_at: string | null
          currency: string | null
          difference_gbp: number | null
          difference_source: number | null
          effective_on: string | null
          group_id: string | null
          id: string | null
          new_fare_gbp: number | null
          new_fare_source: number | null
          notes: string | null
          original_fare_gbp: number | null
          original_fare_source: number | null
          owner_employee_id: string | null
          package_id: string | null
          package_link_ids: string[] | null
          package_match_status: string | null
          package_type: string | null
          passenger_ticket_count: number | null
          previous_adjustment_id: string | null
          reservation_id: string | null
          root_transaction_id: string | null
          sequence_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_fare_adjustments_acting_employee_id_fkey'
            columns: ['acting_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_actor_location_id_fkey'
            columns: ['actor_location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_booking_location_id_fkey'
            columns: ['booking_location_id']
            isOneToOne: false
            referencedRelation: 'locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_owner_employee_id_fkey'
            columns: ['owner_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_previous_same_booking_fkey'
            columns: ['previous_adjustment_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustment_current'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_previous_same_booking_fkey'
            columns: ['previous_adjustment_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustments'
            referencedColumns: ['id', 'booking_id']
          },
          {
            foreignKeyName: 'ticket_fare_adjustments_root_same_booking_fkey'
            columns: ['root_transaction_id', 'booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id', 'booking_id']
          },
        ]
      }
      ticket_fare_check_current: {
        Row: {
          booking_id: string | null
          booking_version: number | null
          checked_by_employee_id: string | null
          commission_scope: string | null
          created_at: string | null
          currency: string | null
          current_adjustment_id: string | null
          effective_on: string | null
          group_id: string | null
          id: string | null
          idempotency_key: string | null
          notes: string | null
          observed_fare_gbp: number | null
          observed_fare_source: number | null
          package_id: string | null
          package_match_status: string | null
          reservation_id: string | null
          root_transaction_id: string | null
          root_transaction_version: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_fare_checks_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'ticket_bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_checked_by_employee_id_fkey'
            columns: ['checked_by_employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_current_adjustment_id_fkey'
            columns: ['current_adjustment_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustment_current'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_current_adjustment_id_fkey'
            columns: ['current_adjustment_id']
            isOneToOne: false
            referencedRelation: 'ticket_fare_adjustments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'travel_package_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'travel_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'travel_package_reservations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_fare_checks_root_transaction_id_fkey'
            columns: ['root_transaction_id']
            isOneToOne: false
            referencedRelation: 'ticket_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_low_fare_filter_owners: {
        Row: {
          employee_id: string | null
          full_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_bookings_owner_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      append_commission_source_event: { Args: { p_event: Json }; Returns: Json }
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
      digest: { Args: { p_data: string; p_type: string }; Returns: string }
      exec_sql: { Args: { sql: string }; Returns: Json[] }
      get_my_sessions: {
        Args: never
        Returns: {
          created_at: string
          id: string
          ip: unknown
          updated_at: string
          user_agent: string
        }[]
      }
      get_user_location_id: { Args: never; Returns: string }
      is_in_department: { Args: { dept_name: string }; Returns: boolean }
      is_manager_of: { Args: { target_employee_id: string }; Returns: boolean }
      is_master_admin: { Args: never; Returns: boolean }
      is_valid_iana_timezone: { Args: { p_value: string }; Returns: boolean }
      lms_add_fee: {
        Args: {
          p_actor_id: string
          p_amount: number
          p_customer_id: string
          p_idempotency_key?: string
          p_loan_id: string
          p_remark?: string
          p_transaction_timestamp?: string
        }
        Returns: Json
      }
      lms_add_service: {
        Args: {
          p_actor_id: string
          p_customer_id: string
          p_idempotency_key?: string
          p_initial_deposit?: number
          p_installment_plan?: Json
          p_next_due_date?: string
          p_remark?: string
          p_service_amount: number
          p_term_months?: number
          p_transaction_timestamp?: string
        }
        Returns: Json
      }
      lms_clear_all_data: { Args: never; Returns: Json }
      lms_create_customer: {
        Args: {
          p_actor_id: string
          p_address?: string
          p_email?: string
          p_first_name: string
          p_idempotency_key?: string
          p_initial_transaction?: Json
          p_last_name: string
          p_phone?: string
        }
        Returns: Json
      }
      lms_delete_customer: {
        Args: { p_actor_id: string; p_customer_id: string }
        Returns: Json
      }
      lms_delete_installment_plan: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      lms_delete_payment: { Args: { p_transaction_id: string }; Returns: Json }
      lms_list_accounts: {
        Args: {
          p_account_id?: string
          p_filter?: string
          p_limit?: number
          p_page?: number
        }
        Returns: Json
      }
      lms_recalculate_loan: { Args: { p_loan_id: string }; Returns: Json }
      lms_record_installment_payment: {
        Args: {
          p_amount: number
          p_employee_id: string
          p_expected_installment_number?: number
          p_idempotency_key?: string
          p_installment_id: string
          p_loan_id: string
          p_payment_method_id?: string
          p_service_transaction_id: string
          p_transaction_timestamp?: string
        }
        Returns: Json
      }
      lms_record_payment: {
        Args: {
          p_amount: number
          p_employee_id: string
          p_idempotency_key?: string
          p_loan_id: string
          p_payment_method_id?: string
          p_remark?: string
          p_transaction_timestamp?: string
        }
        Returns: Json
      }
      lms_skip_installment: {
        Args: { p_installment_id: string }
        Returns: Json
      }
      lms_sync_installment_plan: {
        Args: { p_service_transaction_id: string }
        Returns: undefined
      }
      lms_update_customer: {
        Args: {
          p_actor_id: string
          p_customer_id: string
          p_note?: string
          p_updates?: Json
        }
        Returns: Json
      }
      lms_update_payment: {
        Args: {
          p_amount?: number
          p_payment_method_id?: string
          p_set_payment_method?: boolean
          p_transaction_id: string
          p_transaction_timestamp?: string
        }
        Returns: Json
      }
      lms_wipe_installments: { Args: never; Returns: Json }
      normalize_ticket_pnr_v1: { Args: { p_value: string }; Returns: string }
      release_booking_capacity_reservation: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      replace_backup_codes: {
        Args: { p_code_hashes: Json; p_user_id: string }
        Returns: number
      }
      reserve_booking_capacity: {
        Args: {
          p_booking_id: string
          p_capacity: number
          p_location_id: string
          p_occupied_until: string
          p_start_time: string
        }
        Returns: {
          error: string
          seat_number: number
          success: boolean
        }[]
      }
      revoke_my_session: { Args: { session_id: string }; Returns: undefined }
      ticketing_actor_is_admin_2026082802: {
        Args: { p_employee_id: string }
        Returns: boolean
      }
      ticketing_admin_correct_sale_prices: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_expected_booking_version: number
          p_expected_transaction_version: number
          p_fare_sales: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_append_fare_adjustment: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_append_refund_event_2026082903: {
        Args: {
          p_actor_employee_id: string
          p_amount_gbp: number
          p_event_date: string
          p_event_type: string
          p_expected_version: number
          p_idempotency_key: string
          p_notes: string
          p_override_reason: string
          p_reference: string
          p_refund_id: string
        }
        Returns: Json
      }
      ticketing_append_service_transaction: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_append_service_transaction_allocated: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_append_service_transaction_core_2026082303: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_append_voucher_event_2026082903: {
        Args: {
          p_actor_employee_id: string
          p_airline_reference: string
          p_amount_gbp: number
          p_event_date: string
          p_event_type: string
          p_expected_version: number
          p_idempotency_key: string
          p_linked_booking_id: string
          p_linked_passenger_position: number
          p_linked_passenger_type: string
          p_notes: string
          p_reason: string
          p_refund_id: string
          p_voucher_id: string
        }
        Returns: Json
      }
      ticketing_archive_booking: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_reason?: string
        }
        Returns: Json
      }
      ticketing_claim_time_limit_notifications: {
        Args: { batch_size?: number; requested_at?: string }
        Returns: {
          booking_id: string
          claim_token: string
          customer_name: string
          notification_id: string
          pnr: string
          recipient_email: string
          recipient_employee_id: string
          recipient_name: string
          scheduled_for: string
          threshold_key: string
          time_limit_at: string
          time_limit_timezone: string
        }[]
      }
      ticketing_complete_tk_details: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_details: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_complete_tk_details_authorized: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_details: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_context_id_2026082402: { Args: never; Returns: string }
      ticketing_correct_booking_attribution: {
        Args: {
          p_actor_employee_id: string
          p_attribution: Json
          p_booking_id: string
          p_expected_booking_version: number
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_create_quick_tk: {
        Args: {
          p_actor_employee_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_create_quick_tk_attributed: {
        Args: {
          p_actor_employee_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_create_quick_tk_priced: {
        Args: {
          p_actor_employee_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_create_quick_tk_supplied: {
        Args: {
          p_actor_employee_id: string
          p_entry: Json
          p_idempotency_key: string
        }
        Returns: Json
      }
      ticketing_create_voucher_2026082901: {
        Args: {
          p_actor_employee_id: string
          p_airline_reference: string
          p_booking_id: string
          p_cancellation_date: string
          p_claim_by_date: string
          p_follow_up_employee_id: string
          p_idempotency_key: string
          p_notes: string
          p_passenger_position: number
          p_passenger_type: string
        }
        Returns: Json
      }
      ticketing_enrich_service_business_dates_2026082304: {
        Args: { p_booking_id: string; p_response: Json }
        Returns: Json
      }
      ticketing_finish_time_limit_notification: {
        Args: {
          claim_token_value: string
          delivery_status_value: string
          error_message_value?: string
          notification_id_value: string
        }
        Returns: boolean
      }
      ticketing_import_airline_reference_2026082802: {
        Args: { p_rows: Json }
        Returns: number
      }
      ticketing_import_airport_reference_2026082802: {
        Args: { p_rows: Json }
        Returns: number
      }
      ticketing_initial_pricing_context_matches_2026082801: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
      ticketing_mark_service_transaction_paid: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_idempotency_key: string
          p_payment: Json
          p_transaction_id: string
        }
        Returns: Json
      }
      ticketing_mark_service_transaction_paid_core_2026082303: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_idempotency_key: string
          p_payment: Json
          p_transaction_id: string
        }
        Returns: Json
      }
      ticketing_owner_correction_context_matches_2026082402: {
        Args: {
          p_booking_id: string
          p_new_primary_employee_id: string
          p_old_primary_employee_id: string
        }
        Returns: boolean
      }
      ticketing_reconcile_package_booking_2026082902: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      ticketing_record_fare_check_2026082904: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_effective_on: string
          p_expected_booking_version: number
          p_expected_previous_adjustment_id: string
          p_expected_root_transaction_version: number
          p_idempotency_key: string
          p_notes: string
        }
        Returns: Json
      }
      ticketing_record_refund_2026082903: {
        Args: {
          p_actor_employee_id: string
          p_airline_cancellation_fee_gbp: number
          p_booking_id: string
          p_desired_company_markup_gbp: number
          p_formula_version: string
          p_idempotency_key: string
          p_manual_replacement_sale_price_gbp: number
          p_manual_replacement_supplier_cost_gbp: number
          p_notes: string
          p_override_reason: string
          p_passenger_position: number
          p_passenger_type: string
          p_replacement_agent_commission_gbp: number
          p_replacement_booking_id: string
          p_replacement_desired_markup_gbp: number
          p_replacement_passenger_position: number
          p_replacement_passenger_type: string
          p_retained_agent_commission_gbp: number
          p_settlement_mode: string
          p_supplier_cancellation_charge_gbp: number
        }
        Returns: Json
      }
      ticketing_replace_root_tk_itinerary: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_expected_itinerary_version: number
          p_idempotency_key: string
          p_on_behalf_reason: string
          p_sectors: Json
        }
        Returns: Json
      }
      ticketing_request_booking_change: {
        Args: {
          p_actor_employee_id: string
          p_booking_id: string
          p_request_notes?: string
          p_request_type: string
        }
        Returns: Json
      }
      ticketing_review_booking_change: {
        Args: {
          p_actor_employee_id: string
          p_request_id: string
          p_status: string
        }
        Returns: Json
      }
      ticketing_schema_status: { Args: never; Returns: Json }
      ticketing_transaction_has_been_issued_2026082304: {
        Args: { p_issued_at: string; p_operational_status: string }
        Returns: boolean
      }
      ticketing_transition_schedule_change: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_change_id: string
          p_expected_itinerary_version: number
          p_idempotency_key: string
          p_proposal: Json
          p_reason: string
          p_sector_id: string
        }
        Returns: Json
      }
      ticketing_uuid_array_is_unique_2026082402: {
        Args: { p_values: string[] }
        Returns: boolean
      }
    }
    Enums: {
      applicant_account_type: 'Primary' | 'Dependent'
      application_status:
        | 'Pending Submission'
        | 'Submitted'
        | 'In Progress'
        | 'Requires Information'
        | 'Completed'
        | 'Cancelled'
        | 'Biometrics Taken'
        | 'Passport Arrived'
        | 'Collected'
        | 'Processing'
        | 'Approved'
      appointment_status_type: 'Booked' | 'Completed' | 'Cancelled'
      attendance_source_status: 'Live Scan' | 'Machine Correction' | 'Manual Override' | 'Absent'
      booking_source: 'portal' | 'whatsapp' | 'website'
      booking_status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
      british_age_group: 'Child' | 'Adult'
      british_service_type: 'Normal' | '1 Week' | '1 Day'
      calculation_basis_type: 'Profit' | 'Sale Cost'
      commission_rate_type: 'PERCENTAGE' | 'FIXED_BOOKING' | 'FIXED_PASSENGER'
      commission_recipient: 'AGENT' | 'MANAGER'
      deduction_type: 'PAYE Tax' | 'National Insurance' | 'Pension' | 'Other'
      leave_request_status: 'Pending' | 'Approved' | 'Rejected'
      leave_type_category: 'Annual Leave' | 'Sick Pay' | 'Maternity' | 'Paternity' | 'Other'
      loan_collection_action:
        | 'Phone Call'
        | 'Email Sent'
        | 'Letter Sent'
        | 'Promised Payment'
        | 'Other'
      loan_link_status:
        | 'New Entry'
        | 'Match Found'
        | 'Link Approved'
        | 'No Match'
        | 'Duplicate Confirmed'
      loan_status_type: 'Active' | 'Defaulted' | 'Paid Off' | 'Written Off'
      loan_transaction_type: 'DEBT' | 'PAYMENT' | 'service' | 'payment' | 'fee'
      loyalty_calc_basis: 'SALE_AMOUNT' | 'FIXED_POINTS'
      loyalty_product_type: 'Ticket' | 'Remittance' | 'Visa' | 'Package' | 'Other_Service'
      loyalty_transaction_type: 'Earned' | 'Redeemed' | 'Adjusted'
      nadra_service_type: 'NICOP/CNIC' | 'POC' | 'FRC' | 'CRC' | 'POA'
      nicop_cnic_option:
        | 'Normal'
        | 'Executive'
        | 'Upgrade to Fast'
        | 'Modification'
        | 'Reprint'
        | 'Cancellation'
      package_category: 'Business' | 'Holiday' | 'Ziyarat' | 'Umrah' | 'Hajj' | 'Other'
      package_component_type: 'Flight' | 'Hotel' | 'Visa' | 'Transport' | 'Insurance' | 'Other'
      page_count: '34 pages' | '54 pages'
      pakistani_application_type: 'First Time' | 'Renewal' | 'Modification' | 'Lost'
      pakistani_passport_category: 'Adult 5 Year' | 'Adult 10 Year' | 'Child 5 Year'
      pnr_validation_status: 'Not Applicable' | 'Linked' | 'Warning: Missing PNR'
      poc_processing_speed: 'Normal' | 'Executive'
      poc_service_option:
        | 'Normal (no modification)'
        | 'Normal (modification)'
        | 'Executive (no modification)'
        | 'Executive (modification)'
      processing_speed: 'Normal' | 'Executive'
      product_type_category: 'Ticket' | 'Visa' | 'Package' | 'Nadra' | 'Passport' | 'Service Fee'
      reconciliation_status_type: 'CLEARED' | 'OWED_TO_US' | 'UNPAID_DEBT_IN'
      report_source_type:
        | 'TICKET_LEDGER'
        | 'PACKAGE_COMPONENTS'
        | 'NADRA_APPLICATIONS'
        | 'PK_PASSPORT_APPLICATIONS'
        | 'GB_PASSPORT_APPLICATIONS'
        | 'VISA_APPLICATIONS'
        | 'DAILY_LEDGER'
        | 'PAYROLL_LEDGER'
      ticket_booking_status: 'Held' | 'Issued' | 'Cancelled' | 'Expired'
      ticket_payment_status: 'Unpaid' | 'Partial Paid' | 'Paid'
      ticket_service_type: 'TK' | 'DC' | 'PT' | 'RF' | 'SF'
      transaction_type_category: 'INCOME' | 'EXPENSE'
      vendor_category:
        | 'Remittance Agent'
        | 'Utility Provider'
        | 'Supplier'
        | 'Office Supplies'
        | 'Other'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      applicant_account_type: ['Primary', 'Dependent'],
      application_status: [
        'Pending Submission',
        'Submitted',
        'In Progress',
        'Requires Information',
        'Completed',
        'Cancelled',
        'Biometrics Taken',
        'Passport Arrived',
        'Collected',
        'Processing',
        'Approved',
      ],
      appointment_status_type: ['Booked', 'Completed', 'Cancelled'],
      attendance_source_status: ['Live Scan', 'Machine Correction', 'Manual Override', 'Absent'],
      booking_source: ['portal', 'whatsapp', 'website'],
      booking_status: ['pending', 'confirmed', 'cancelled', 'completed'],
      british_age_group: ['Child', 'Adult'],
      british_service_type: ['Normal', '1 Week', '1 Day'],
      calculation_basis_type: ['Profit', 'Sale Cost'],
      commission_rate_type: ['PERCENTAGE', 'FIXED_BOOKING', 'FIXED_PASSENGER'],
      commission_recipient: ['AGENT', 'MANAGER'],
      deduction_type: ['PAYE Tax', 'National Insurance', 'Pension', 'Other'],
      leave_request_status: ['Pending', 'Approved', 'Rejected'],
      leave_type_category: ['Annual Leave', 'Sick Pay', 'Maternity', 'Paternity', 'Other'],
      loan_collection_action: [
        'Phone Call',
        'Email Sent',
        'Letter Sent',
        'Promised Payment',
        'Other',
      ],
      loan_link_status: [
        'New Entry',
        'Match Found',
        'Link Approved',
        'No Match',
        'Duplicate Confirmed',
      ],
      loan_status_type: ['Active', 'Defaulted', 'Paid Off', 'Written Off'],
      loan_transaction_type: ['DEBT', 'PAYMENT', 'service', 'payment', 'fee'],
      loyalty_calc_basis: ['SALE_AMOUNT', 'FIXED_POINTS'],
      loyalty_product_type: ['Ticket', 'Remittance', 'Visa', 'Package', 'Other_Service'],
      loyalty_transaction_type: ['Earned', 'Redeemed', 'Adjusted'],
      nadra_service_type: ['NICOP/CNIC', 'POC', 'FRC', 'CRC', 'POA'],
      nicop_cnic_option: [
        'Normal',
        'Executive',
        'Upgrade to Fast',
        'Modification',
        'Reprint',
        'Cancellation',
      ],
      package_category: ['Business', 'Holiday', 'Ziyarat', 'Umrah', 'Hajj', 'Other'],
      package_component_type: ['Flight', 'Hotel', 'Visa', 'Transport', 'Insurance', 'Other'],
      page_count: ['34 pages', '54 pages'],
      pakistani_application_type: ['First Time', 'Renewal', 'Modification', 'Lost'],
      pakistani_passport_category: ['Adult 5 Year', 'Adult 10 Year', 'Child 5 Year'],
      pnr_validation_status: ['Not Applicable', 'Linked', 'Warning: Missing PNR'],
      poc_processing_speed: ['Normal', 'Executive'],
      poc_service_option: [
        'Normal (no modification)',
        'Normal (modification)',
        'Executive (no modification)',
        'Executive (modification)',
      ],
      processing_speed: ['Normal', 'Executive'],
      product_type_category: ['Ticket', 'Visa', 'Package', 'Nadra', 'Passport', 'Service Fee'],
      reconciliation_status_type: ['CLEARED', 'OWED_TO_US', 'UNPAID_DEBT_IN'],
      report_source_type: [
        'TICKET_LEDGER',
        'PACKAGE_COMPONENTS',
        'NADRA_APPLICATIONS',
        'PK_PASSPORT_APPLICATIONS',
        'GB_PASSPORT_APPLICATIONS',
        'VISA_APPLICATIONS',
        'DAILY_LEDGER',
        'PAYROLL_LEDGER',
      ],
      ticket_booking_status: ['Held', 'Issued', 'Cancelled', 'Expired'],
      ticket_payment_status: ['Unpaid', 'Partial Paid', 'Paid'],
      ticket_service_type: ['TK', 'DC', 'PT', 'RF', 'SF'],
      transaction_type_category: ['INCOME', 'EXPENSE'],
      vendor_category: [
        'Remittance Agent',
        'Utility Provider',
        'Supplier',
        'Office Supplies',
        'Other',
      ],
    },
  },
} as const

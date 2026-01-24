-- ============================================================================
-- PT PORTAL - SUPABASE DATABASE SCHEMA REFERENCE
-- ============================================================================
-- Schema: Public
-- 
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- 
-- Last Updated: January 23, 2026
-- ============================================================================

-- ============================================================================
-- ACCOUNTING & FINANCIAL TABLES
-- ============================================================================

CREATE TABLE public.accounting_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  type USER-DEFINED NOT NULL,
  CONSTRAINT accounting_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.daily_ledger_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  supplier_vendor_id uuid,
  category_id uuid NOT NULL,
  customer_full_name text,
  remark text,
  total_amount numeric NOT NULL,
  source_link_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT daily_ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT daily_ledger_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT daily_ledger_entries_supplier_vendor_id_fkey FOREIGN KEY (supplier_vendor_id) REFERENCES public.supplier_vendors(id),
  CONSTRAINT daily_ledger_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.accounting_categories(id)
);

CREATE TABLE public.daily_payment_splits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  transaction_type USER-DEFINED NOT NULL,
  amount numeric NOT NULL,
  reconciliation_status USER-DEFINED NOT NULL DEFAULT 'CLEARED'::reconciliation_status_type,
  clearing_lms_transaction_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT daily_payment_splits_pkey PRIMARY KEY (id),
  CONSTRAINT daily_payment_splits_ledger_entry_id_fkey FOREIGN KEY (ledger_entry_id) REFERENCES public.daily_ledger_entries(id),
  CONSTRAINT daily_payment_splits_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.transaction_methods(id),
  CONSTRAINT daily_payment_splits_clearing_lms_transaction_id_fkey FOREIGN KEY (clearing_lms_transaction_id) REFERENCES public.loan_transactions(id)
);

CREATE TABLE public.daily_till_closeout (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  work_date date NOT NULL,
  branch_id uuid NOT NULL,
  final_cash_counted numeric NOT NULL,
  cash_difference numeric NOT NULL,
  approved_by_manager_id uuid,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT daily_till_closeout_pkey PRIMARY KEY (id),
  CONSTRAINT daily_till_closeout_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.locations(id),
  CONSTRAINT daily_till_closeout_approved_by_manager_id_fkey FOREIGN KEY (approved_by_manager_id) REFERENCES public.employees(id)
);

CREATE TABLE public.monthly_pnl_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_month date NOT NULL,
  category_id uuid NOT NULL,
  in_amount numeric,
  out_amount numeric,
  compiled_by_employee_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT monthly_pnl_reports_pkey PRIMARY KEY (id),
  CONSTRAINT monthly_pnl_reports_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.pnl_reporting_categories(id),
  CONSTRAINT monthly_pnl_reports_compiled_by_employee_id_fkey FOREIGN KEY (compiled_by_employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.pnl_reporting_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_name text NOT NULL UNIQUE,
  source_table USER-DEFINED NOT NULL,
  source_category text,
  is_expense boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pnl_reporting_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.transaction_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  CONSTRAINT transaction_methods_pkey PRIMARY KEY (id)
);

CREATE TABLE public.supplier_vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  vendor_type USER-DEFINED NOT NULL,
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT supplier_vendors_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- EMPLOYEE & HR TABLES
-- ============================================================================

CREATE TABLE public.roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  level integer NOT NULL CHECK (level > 0),
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  CONSTRAINT departments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  name text NOT NULL,
  address text,
  type text,
  parent_location_id uuid,
  branch_code text UNIQUE,
  CONSTRAINT locations_pkey PRIMARY KEY (id),
  CONSTRAINT locations_parent_location_id_fkey FOREIGN KEY (parent_location_id) REFERENCES public.locations(id)
);

CREATE TABLE public.employees (
  id uuid NOT NULL,
  full_name text,
  email text UNIQUE,
  role_id uuid NOT NULL,
  department_id uuid,
  location_id uuid,
  manager_id uuid,
  national_insurance_number text UNIQUE,
  tax_code text,
  pay_basis USER-DEFINED,
  pay_rate numeric,
  holiday_entitlement_days integer,
  sick_pay_entitlement_days integer,
  timecard_approver_id uuid,
  is_temporary_password boolean DEFAULT false,
  two_factor_secret text,
  two_factor_enabled boolean DEFAULT false,
  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT employees_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT employees_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id),
  CONSTRAINT employees_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),
  CONSTRAINT employees_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.employees(id),
  CONSTRAINT employees_timecard_approver_id_fkey FOREIGN KEY (timecard_approver_id) REFERENCES public.employees(id)
);

CREATE TABLE public.employee_departments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  department_id uuid NOT NULL,
  CONSTRAINT employee_departments_pkey PRIMARY KEY (id),
  CONSTRAINT employee_departments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT employee_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id)
);

CREATE TABLE public.employee_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  document_type text NOT NULL,
  storage_url text NOT NULL,
  verification_status text NOT NULL DEFAULT 'Pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT employee_documents_pkey PRIMARY KEY (id),
  CONSTRAINT employee_documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.employee_leave (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  leave_type USER-DEFINED NOT NULL,
  request_status USER-DEFINED NOT NULL DEFAULT 'Pending'::leave_request_status,
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  approved_by_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT employee_leave_pkey PRIMARY KEY (id),
  CONSTRAINT employee_leave_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT employee_leave_approved_by_id_fkey FOREIGN KEY (approved_by_id) REFERENCES public.employees(id)
);

CREATE TABLE public.employee_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  review_type text NOT NULL,
  summary_notes text,
  issue_date date,
  resolution_date date,
  action_taken text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT employee_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT employee_reviews_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT employee_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.employees(id)
);

CREATE TABLE public.attendance_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  location_id uuid,
  work_date date NOT NULL,
  time_in timestamp with time zone,
  time_out timestamp with time zone,
  total_minutes_worked integer NOT NULL,
  total_break_minutes integer DEFAULT 0,
  is_break_paid boolean DEFAULT false,
  actual_work_minutes integer NOT NULL,
  record_source_status USER-DEFINED NOT NULL,
  machine_notes text,
  is_approved boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT attendance_records_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT attendance_records_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id)
);

CREATE TABLE public.payroll_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  pay_period_end_date date NOT NULL,
  total_gross_pay numeric NOT NULL,
  total_deductions numeric NOT NULL,
  net_pay numeric NOT NULL,
  gross_ytd numeric,
  tax_paid_ytd numeric,
  ni_ytd numeric,
  is_submitted_to_accountant boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT payroll_records_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.payroll_deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payroll_record_id uuid NOT NULL,
  deduction_type USER-DEFINED NOT NULL,
  amount numeric NOT NULL,
  CONSTRAINT payroll_deductions_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_deductions_payroll_record_id_fkey FOREIGN KEY (payroll_record_id) REFERENCES public.payroll_records(id)
);

-- ============================================================================
-- AUTHENTICATION & SECURITY TABLES
-- ============================================================================

CREATE TABLE public.password_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  password_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT password_history_pkey PRIMARY KEY (id),
  CONSTRAINT password_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.backup_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  code_hash text NOT NULL,
  used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT backup_codes_pkey PRIMARY KEY (id),
  CONSTRAINT backup_codes_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.deletion_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  record_type text NOT NULL,
  deleted_record_data jsonb,
  deleted_by uuid,
  auth_code_used text,
  deleted_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT deletion_logs_pkey PRIMARY KEY (id),
  CONSTRAINT deletion_logs_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.employees(id)
);

-- ============================================================================
-- COMMISSION & LOYALTY TABLES
-- ============================================================================

CREATE TABLE public.commission_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  product_type USER-DEFINED NOT NULL,
  calculation_basis USER-DEFINED NOT NULL,
  applies_to_tier boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT commission_rules_pkey PRIMARY KEY (id)
);

CREATE TABLE public.commission_rate_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL,
  recipient USER-DEFINED NOT NULL,
  rate_type USER-DEFINED NOT NULL,
  rate_value numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT commission_rate_components_pkey PRIMARY KEY (id),
  CONSTRAINT commission_rate_components_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rules(id)
);

CREATE TABLE public.commission_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL,
  min_threshold numeric NOT NULL,
  rate_value numeric NOT NULL,
  rate_type USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT commission_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT commission_tiers_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rules(id)
);

CREATE TABLE public.employee_commission_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  rule_id uuid NOT NULL,
  start_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT employee_commission_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT employee_commission_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT employee_commission_assignments_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rules(id)
);

CREATE TABLE public.loyalty_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tier_name text NOT NULL UNIQUE,
  min_points_threshold integer NOT NULL DEFAULT 0,
  earning_multiplier numeric NOT NULL DEFAULT 1.00,
  display_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loyalty_tiers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.loyalty_earning_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_type USER-DEFINED NOT NULL,
  calculation_basis USER-DEFINED NOT NULL,
  rate_value numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loyalty_earning_rules_pkey PRIMARY KEY (id)
);

CREATE TABLE public.loyalty_redeem_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  points_cost integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loyalty_redeem_catalog_pkey PRIMARY KEY (id)
);

CREATE TABLE public.mobile_users (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  phone_number text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT mobile_users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.loyalty_points_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  transaction_type USER-DEFINED NOT NULL,
  points_change integer NOT NULL,
  source_ledger_id uuid,
  scan_terminal_ref text,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  mobile_user_id uuid NOT NULL,
  CONSTRAINT loyalty_points_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_points_ledger_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT loyalty_points_ledger_mobile_user_id_fkey FOREIGN KEY (mobile_user_id) REFERENCES public.mobile_users(id)
);

-- ============================================================================
-- APPLICANT & APPLICATION TABLES
-- ============================================================================

CREATE TABLE public.applicants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  citizen_number text UNIQUE,
  date_of_birth date,
  email text,
  phone_number text,
  account_type USER-DEFINED NOT NULL DEFAULT 'Primary'::applicant_account_type,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  first_name text,
  last_name text,
  referred_by_applicant_id uuid,
  passport_number text,
  dob date,
  is_new_born boolean DEFAULT false,
  CONSTRAINT applicants_pkey PRIMARY KEY (id),
  CONSTRAINT applicants_referred_by_applicant_id_fkey FOREIGN KEY (referred_by_applicant_id) REFERENCES public.applicants(id)
);

CREATE TABLE public.applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tracking_number text NOT NULL UNIQUE,
  family_head_id uuid NOT NULL,
  applicant_id uuid NOT NULL,
  submitted_by_employee_id uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'Pending Submission'::application_status,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT applications_pkey PRIMARY KEY (id),
  CONSTRAINT applications_family_head_id_fkey FOREIGN KEY (family_head_id) REFERENCES public.applicants(id),
  CONSTRAINT applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT applications_submitted_by_employee_id_fkey FOREIGN KEY (submitted_by_employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.mobile_users_profile_link (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mobile_user_id uuid NOT NULL UNIQUE,
  applicant_id uuid,
  match_status text NOT NULL DEFAULT 'Pending Match'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT mobile_users_profile_link_pkey PRIMARY KEY (id),
  CONSTRAINT mobile_users_profile_link_mobile_user_id_fkey FOREIGN KEY (mobile_user_id) REFERENCES public.mobile_users(id),
  CONSTRAINT mobile_users_profile_link_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id)
);

-- ============================================================================
-- NADRA SERVICE TABLES
-- ============================================================================

CREATE TABLE public.nadra_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  service_type USER-DEFINED NOT NULL,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  tracking_number text,
  status USER-DEFINED NOT NULL DEFAULT 'Pending Submission'::application_status,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  application_pin text,
  application_id uuid,
  CONSTRAINT nadra_services_pkey PRIMARY KEY (id),
  CONSTRAINT nadra_services_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT nadra_services_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT nadra_services_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id)
);

CREATE TABLE public.nicop_cnic_details (
  id uuid NOT NULL,
  service_option USER-DEFINED NOT NULL,
  CONSTRAINT nicop_cnic_details_pkey PRIMARY KEY (id),
  CONSTRAINT nicop_cnic_details_id_fkey FOREIGN KEY (id) REFERENCES public.nadra_services(id)
);

CREATE TABLE public.poc_details (
  id uuid NOT NULL,
  service_option USER-DEFINED NOT NULL,
  CONSTRAINT poc_details_pkey PRIMARY KEY (id),
  CONSTRAINT poc_details_id_fkey FOREIGN KEY (id) REFERENCES public.nadra_services(id)
);

CREATE TABLE public.nadra_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nadra_service_id uuid,
  old_status text,
  new_status text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT nadra_status_history_nadra_service_id_fkey FOREIGN KEY (nadra_service_id) REFERENCES public.nadra_services(id),
  CONSTRAINT nadra_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.employees(id)
);

-- ============================================================================
-- PAKISTANI PASSPORT TABLES
-- ============================================================================

CREATE TABLE public.pakistani_passport_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  tracking_number text,
  passport_number text,
  status USER-DEFINED NOT NULL DEFAULT 'Pending Submission'::application_status,
  category USER-DEFINED NOT NULL,
  speed USER-DEFINED NOT NULL,
  application_type USER-DEFINED NOT NULL,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  old_passport_number text,
  new_passport_number text,
  is_old_passport_returned boolean DEFAULT false,
  old_passport_returned_at timestamp with time zone,
  old_passport_returned_by uuid,
  fingerprints_completed boolean DEFAULT false,
  page_count text,
  application_id uuid,
  family_head_email text,
  CONSTRAINT pakistani_passport_applications_pkey PRIMARY KEY (id),
  CONSTRAINT pakistani_passport_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT pakistani_passport_applications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT pakistani_passport_applications_old_passport_returned_by_fkey FOREIGN KEY (old_passport_returned_by) REFERENCES public.employees(id),
  CONSTRAINT pakistani_passport_applications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id)
);

CREATE TABLE public.pakistani_passport_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  passport_application_id uuid,
  old_status text,
  new_status text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pakistani_passport_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT pakistani_passport_status_history_passport_application_id_fkey FOREIGN KEY (passport_application_id) REFERENCES public.pakistani_passport_applications(id),
  CONSTRAINT pakistani_passport_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.employees(id)
);

CREATE TABLE public.passport_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  passport_app_id uuid,
  old_status text,
  new_status text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT passport_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT passport_status_history_passport_app_id_fkey FOREIGN KEY (passport_app_id) REFERENCES public.pakistani_passport_applications(id),
  CONSTRAINT passport_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.employees(id)
);

-- ============================================================================
-- BRITISH PASSPORT TABLES
-- ============================================================================

CREATE TABLE public.gb_passport_ages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_ages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.gb_passport_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  option_label text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_pages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.gb_passport_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_services_pkey PRIMARY KEY (id)
);

CREATE TABLE public.gb_passport_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  age_id uuid,
  pages_id uuid,
  service_id uuid,
  cost_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_pricing_pkey PRIMARY KEY (id),
  CONSTRAINT gb_passport_pricing_age_id_fkey FOREIGN KEY (age_id) REFERENCES public.gb_passport_ages(id),
  CONSTRAINT gb_passport_pricing_pages_id_fkey FOREIGN KEY (pages_id) REFERENCES public.gb_passport_pages(id),
  CONSTRAINT gb_passport_pricing_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.gb_passport_services(id)
);

CREATE TABLE public.british_passport_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  pex_number text,
  passport_number text,
  status USER-DEFINED NOT NULL DEFAULT 'Pending Submission'::application_status,
  age_group text NOT NULL,
  service_type text NOT NULL,
  pages text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  application_id uuid,
  cost_price numeric DEFAULT 0,
  sale_price numeric DEFAULT 0,
  pricing_id uuid,
  CONSTRAINT british_passport_applications_pkey PRIMARY KEY (id),
  CONSTRAINT british_passport_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT british_passport_applications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT british_passport_applications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id),
  CONSTRAINT british_passport_applications_pricing_id_fkey FOREIGN KEY (pricing_id) REFERENCES public.gb_passport_pricing(id)
);

CREATE TABLE public.british_passport_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  passport_id uuid,
  old_status text,
  new_status text,
  notes text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT british_passport_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT british_passport_status_history_passport_id_fkey FOREIGN KEY (passport_id) REFERENCES public.british_passport_applications(id),
  CONSTRAINT british_passport_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.employees(id)
);

-- ============================================================================
-- VISA TABLES
-- ============================================================================

CREATE TABLE public.visa_countries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  CONSTRAINT visa_countries_pkey PRIMARY KEY (id)
);

CREATE TABLE public.visa_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_cost numeric DEFAULT 0,
  default_price numeric DEFAULT 0,
  country_id uuid,
  default_validity text,
  allowed_nationalities ARRAY,
  CONSTRAINT visa_types_pkey PRIMARY KEY (id),
  CONSTRAINT visa_types_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.visa_countries(id)
);

CREATE TABLE public.visa_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  internal_tracking_number text NOT NULL UNIQUE,
  applicant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  visa_country_id uuid NOT NULL,
  visa_type_id uuid NOT NULL,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  external_application_number text,
  passport_number_used text,
  customer_price numeric,
  base_price numeric,
  cost_currency text DEFAULT 'GBP'::text,
  notes text,
  status USER-DEFINED NOT NULL DEFAULT 'Pending Submission'::application_status,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  package_id uuid,
  is_loyalty_claimed boolean NOT NULL DEFAULT false,
  validity text,
  is_part_of_package boolean DEFAULT false,
  CONSTRAINT visa_applications_pkey PRIMARY KEY (id),
  CONSTRAINT visa_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT visa_applications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT visa_applications_visa_country_id_fkey FOREIGN KEY (visa_country_id) REFERENCES public.visa_countries(id),
  CONSTRAINT visa_applications_visa_type_id_fkey FOREIGN KEY (visa_type_id) REFERENCES public.visa_types(id),
  CONSTRAINT visa_applications_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id)
);

CREATE TABLE public.visa_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  visa_application_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT visa_status_history_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- TICKET & AIRLINE TABLES
-- ============================================================================

CREATE TABLE public.airlines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  iata_code character NOT NULL UNIQUE,
  name text NOT NULL,
  CONSTRAINT airlines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.ticket_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  passenger_name text,
  contact_phone text,
  pnr text NOT NULL,
  airline_id uuid,
  departure_date date,
  return_date date,
  booking_deadline timestamp with time zone,
  issued_date date,
  booking_type USER-DEFINED NOT NULL,
  total_passengers integer NOT NULL DEFAULT 1,
  sale_cost numeric,
  initial_fare_cost numeric,
  final_fare_cost numeric,
  booking_status USER-DEFINED NOT NULL DEFAULT 'Held'::ticket_booking_status,
  payment_status USER-DEFINED NOT NULL DEFAULT 'Unpaid'::ticket_payment_status,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  package_id uuid,
  final_agent_id uuid,
  is_loyalty_claimed boolean NOT NULL DEFAULT false,
  CONSTRAINT ticket_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_ledger_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT ticket_ledger_airline_id_fkey FOREIGN KEY (airline_id) REFERENCES public.airlines(id),
  CONSTRAINT ticket_ledger_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id),
  CONSTRAINT ticket_ledger_final_agent_id_fkey FOREIGN KEY (final_agent_id) REFERENCES public.employees(id)
);

-- ============================================================================
-- PACKAGE & TRAVEL TABLES
-- ============================================================================

CREATE TABLE public.package_destinations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  CONSTRAINT package_destinations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  package_ref_number text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  employee_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  package_type USER-DEFINED NOT NULL,
  sale_price_total numeric,
  is_processed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT packages_pkey PRIMARY KEY (id),
  CONSTRAINT packages_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT packages_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.package_destinations(id)
);

CREATE TABLE public.package_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL,
  component_type USER-DEFINED NOT NULL,
  component_description text,
  supplier_name text,
  buy_rate numeric NOT NULL,
  supplier_commission numeric NOT NULL DEFAULT 0.00,
  sell_rate numeric NOT NULL,
  linked_detail_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT package_components_pkey PRIMARY KEY (id),
  CONSTRAINT package_components_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id)
);

CREATE TABLE public.package_hotel_details (
  id uuid NOT NULL,
  supplier_name text NOT NULL,
  hotel_name text NOT NULL,
  CONSTRAINT package_hotel_details_pkey PRIMARY KEY (id),
  CONSTRAINT package_hotel_details_id_fkey FOREIGN KEY (id) REFERENCES public.package_components(id)
);

-- ============================================================================
-- LOAN MANAGEMENT SYSTEM (LMS) TABLES
-- ============================================================================

CREATE TABLE public.loan_customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date,
  phone_number text,
  email text,
  address text,
  postcode text,
  applicant_id uuid,
  suggested_applicant_id uuid,
  link_status USER-DEFINED NOT NULL DEFAULT 'New Entry'::loan_link_status,
  override_reason text,
  created_by_employee_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loan_customers_pkey PRIMARY KEY (id),
  CONSTRAINT loan_customers_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT loan_customers_suggested_applicant_id_fkey FOREIGN KEY (suggested_applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT loan_customers_created_by_employee_id_fkey FOREIGN KEY (created_by_employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.loans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_customer_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  total_debt_amount numeric NOT NULL,
  current_balance numeric NOT NULL,
  term_months integer,
  next_due_date date,
  status USER-DEFINED NOT NULL DEFAULT 'Active'::loan_status_type,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loans_pkey PRIMARY KEY (id),
  CONSTRAINT loans_loan_customer_id_fkey FOREIGN KEY (loan_customer_id) REFERENCES public.loan_customers(id),
  CONSTRAINT loans_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.loan_service_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  CONSTRAINT loan_service_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.loan_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  CONSTRAINT loan_payment_methods_pkey PRIMARY KEY (id)
);

CREATE TABLE public.loan_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  transaction_type USER-DEFINED NOT NULL,
  amount numeric NOT NULL,
  service_category_id uuid,
  due_date date,
  payment_method_id uuid,
  payer_name text,
  remark text,
  transaction_timestamp timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  package_ref_status USER-DEFINED NOT NULL DEFAULT 'Not Applicable'::pnr_validation_status,
  CONSTRAINT loan_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT loan_transactions_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id),
  CONSTRAINT loan_transactions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT loan_transactions_service_category_id_fkey FOREIGN KEY (service_category_id) REFERENCES public.loan_service_categories(id),
  CONSTRAINT loan_transactions_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.loan_payment_methods(id)
);

CREATE TABLE public.loan_package_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_transaction_id uuid NOT NULL,
  package_ref_number text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loan_package_links_pkey PRIMARY KEY (id),
  CONSTRAINT loan_package_links_loan_transaction_id_fkey FOREIGN KEY (loan_transaction_id) REFERENCES public.loan_transactions(id)
);

CREATE TABLE public.loan_collections_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  action_type USER-DEFINED NOT NULL,
  notes text,
  next_action_date date,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loan_collections_log_pkey PRIMARY KEY (id),
  CONSTRAINT loan_collections_log_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id),
  CONSTRAINT loan_collections_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

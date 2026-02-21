-- Migration: Add is_active field to employees table
-- Date: 2026-02-21
-- Purpose: Enable temporary disabling of staff members without deleting their records

ALTER TABLE public.employees
ADD COLUMN is_active boolean DEFAULT true NOT NULL;

-- Create index for efficient filtering of active employees
CREATE INDEX idx_employees_is_active ON public.employees(is_active);

-- Update comment
COMMENT ON COLUMN public.employees.is_active IS 'When false, employee cannot log in or access the system. Used for temporary suspension.';

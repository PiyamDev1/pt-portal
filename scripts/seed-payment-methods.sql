-- Seed payment methods for LMS
-- Run this in Supabase SQL Editor

INSERT INTO loan_payment_methods (name) VALUES
  ('Cash'),
  ('Bank Transfer'),
  ('Card Payment');

-- Verify insertion
SELECT * FROM loan_payment_methods ORDER BY name;

-- ============================================================================
-- SEED PRICING DATA FROM HARDCODED DROPDOWNS
-- ============================================================================

-- NADRA Service Types & Options
-- From: app/dashboard/applications/nadra/components/FormSection.tsx

-- Service Types: NICOP/CNIC, POC, FRC, CRC, POA
-- Service Options: Normal, Executive, Upgrade to Fast, Modification, Reprint, Cancellation

INSERT INTO nadra_pricing (service_type, service_option, cost_price, sale_price, is_active) VALUES
-- NICOP/CNIC options
('NICOP/CNIC', 'Normal', 0, 0, true),
('NICOP/CNIC', 'Executive', 0, 0, true),
('NICOP/CNIC', 'Upgrade to Fast', 0, 0, true),
('NICOP/CNIC', 'Modification', 0, 0, true),
('NICOP/CNIC', 'Reprint', 0, 0, true),
('NICOP/CNIC', 'Cancellation', 0, 0, true),
-- POC options
('POC', 'Normal', 0, 0, true),
('POC', 'Executive', 0, 0, true),
('POC', 'Upgrade to Fast', 0, 0, true),
('POC', 'Modification', 0, 0, true),
('POC', 'Reprint', 0, 0, true),
('POC', 'Cancellation', 0, 0, true),
-- FRC options
('FRC', 'Normal', 0, 0, true),
('FRC', 'Executive', 0, 0, true),
('FRC', 'Upgrade to Fast', 0, 0, true),
('FRC', 'Modification', 0, 0, true),
('FRC', 'Reprint', 0, 0, true),
('FRC', 'Cancellation', 0, 0, true),
-- CRC options
('CRC', 'Normal', 0, 0, true),
('CRC', 'Executive', 0, 0, true),
('CRC', 'Upgrade to Fast', 0, 0, true),
('CRC', 'Modification', 0, 0, true),
('CRC', 'Reprint', 0, 0, true),
('CRC', 'Cancellation', 0, 0, true),
-- POA options
('POA', 'Normal', 0, 0, true),
('POA', 'Executive', 0, 0, true),
('POA', 'Upgrade to Fast', 0, 0, true),
('POA', 'Modification', 0, 0, true),
('POA', 'Reprint', 0, 0, true),
('POA', 'Cancellation', 0, 0, true)
ON CONFLICT (service_type, service_option) DO NOTHING;

-- ============================================================================
-- PAKISTANI PASSPORT PRICING
-- ============================================================================
-- Categories: 'Adult 10 Year' | 'Adult 5 Year' | 'Child 5 Year'
-- Speeds: 'Normal' | 'Executive'
-- Application Types: 'First Time' | 'Renewal' | 'Modification' | 'Lost'

INSERT INTO pk_passport_pricing (category, speed, application_type, cost_price, sale_price, is_active) VALUES
-- Adult 10 Year - Normal
('Adult 10 Year', 'Normal', 'First Time', 0, 0, true),
('Adult 10 Year', 'Normal', 'Renewal', 0, 0, true),
('Adult 10 Year', 'Normal', 'Modification', 0, 0, true),
('Adult 10 Year', 'Normal', 'Lost', 0, 0, true),
-- Adult 10 Year - Executive
('Adult 10 Year', 'Executive', 'First Time', 0, 0, true),
('Adult 10 Year', 'Executive', 'Renewal', 0, 0, true),
('Adult 10 Year', 'Executive', 'Modification', 0, 0, true),
('Adult 10 Year', 'Executive', 'Lost', 0, 0, true),
-- Adult 5 Year - Normal
('Adult 5 Year', 'Normal', 'First Time', 0, 0, true),
('Adult 5 Year', 'Normal', 'Renewal', 0, 0, true),
('Adult 5 Year', 'Normal', 'Modification', 0, 0, true),
('Adult 5 Year', 'Normal', 'Lost', 0, 0, true),
-- Adult 5 Year - Executive
('Adult 5 Year', 'Executive', 'First Time', 0, 0, true),
('Adult 5 Year', 'Executive', 'Renewal', 0, 0, true),
('Adult 5 Year', 'Executive', 'Modification', 0, 0, true),
('Adult 5 Year', 'Executive', 'Lost', 0, 0, true),
-- Child 5 Year - Normal
('Child 5 Year', 'Normal', 'First Time', 0, 0, true),
('Child 5 Year', 'Normal', 'Renewal', 0, 0, true),
('Child 5 Year', 'Normal', 'Modification', 0, 0, true),
('Child 5 Year', 'Normal', 'Lost', 0, 0, true),
-- Child 5 Year - Executive
('Child 5 Year', 'Executive', 'First Time', 0, 0, true),
('Child 5 Year', 'Executive', 'Renewal', 0, 0, true),
('Child 5 Year', 'Executive', 'Modification', 0, 0, true),
('Child 5 Year', 'Executive', 'Lost', 0, 0, true)
ON CONFLICT (category, speed, application_type) DO NOTHING;

-- ============================================================================
-- GB PASSPORT PRICING
-- ============================================================================
-- Age Groups: Adult, Child, Infant (from gb_passport_ages metadata)
-- Pages: 32, 48, 52 (from gb_passport_pages - these would be actual page options)
-- Service Types: Standard, Express, Premium

INSERT INTO gb_passport_pricing (age_group, pages, service_type, cost_price, sale_price, is_active) VALUES
-- Adult - 32 pages
('Adult', '32', 'Standard', 0, 0, true),
('Adult', '32', 'Express', 0, 0, true),
('Adult', '32', 'Premium', 0, 0, true),
-- Adult - 48 pages
('Adult', '48', 'Standard', 0, 0, true),
('Adult', '48', 'Express', 0, 0, true),
('Adult', '48', 'Premium', 0, 0, true),
-- Adult - 52 pages
('Adult', '52', 'Standard', 0, 0, true),
('Adult', '52', 'Express', 0, 0, true),
('Adult', '52', 'Premium', 0, 0, true),
-- Child - 32 pages
('Child', '32', 'Standard', 0, 0, true),
('Child', '32', 'Express', 0, 0, true),
('Child', '32', 'Premium', 0, 0, true),
-- Child - 48 pages
('Child', '48', 'Standard', 0, 0, true),
('Child', '48', 'Express', 0, 0, true),
('Child', '48', 'Premium', 0, 0, true),
-- Child - 52 pages
('Child', '52', 'Standard', 0, 0, true),
('Child', '52', 'Express', 0, 0, true),
('Child', '52', 'Premium', 0, 0, true),
-- Infant - 32 pages
('Infant', '32', 'Standard', 0, 0, true),
('Infant', '32', 'Express', 0, 0, true),
('Infant', '32', 'Premium', 0, 0, true),
-- Infant - 48 pages
('Infant', '48', 'Standard', 0, 0, true),
('Infant', '48', 'Express', 0, 0, true),
('Infant', '48', 'Premium', 0, 0, true),
-- Infant - 52 pages
('Infant', '52', 'Standard', 0, 0, true),
('Infant', '52', 'Express', 0, 0, true),
('Infant', '52', 'Premium', 0, 0, true)
ON CONFLICT (age_group, pages, service_type) DO NOTHING;

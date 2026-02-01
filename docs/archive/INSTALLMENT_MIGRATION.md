# Installment Tracking System Migration

## Overview
The system now tracks installments in the database with unique IDs for each installment, providing full traceability and support for external applications.

## What Changed

### Database
- **New Table**: `loan_installments` stores each installment as a separate record
- Each installment has:
  - Unique ID (UUID)
  - Installment number (1, 2, 3, etc.)
  - Due date
  - Amount
  - Status (pending, paid, partial, overdue)
  - Amount paid (tracks partial payments)

### Features
1. **Installment IDs in Descriptions**: All payments now reference installment IDs
2. **Status Tracking**: Visual status indicators (pending=blue, paid=green, partial=yellow, overdue=red)
3. **Multiple Installments**: System can handle multiple service loans with separate installment plans
4. **Database-First**: All data stored in DB for use by other applications

## Migration Steps

### 1. Create the Installments Table
Run the SQL script to create the table:
```bash
# Option A: Run via Supabase SQL Editor
# Copy contents of scripts/create-installments-table.sql and run in Supabase

# Option B: Use the migration endpoint
POST https://your-domain.com/api/admin/create-installments
```

### 2. Generate Installments for Existing Loans
The migration endpoint will:
- Create the installments table if it doesn't exist
- Scan all existing service transactions
- Generate 3 installment records for each (adjustable)
- Skip duplicates automatically

### 3. Verify
Check the `loan_installments` table in Supabase to confirm records were created.

## Usage

### For Agents
- Click any installment row in the statement to record a payment
- Installment ID is displayed in the description
- Status updates automatically (pending → partial → paid)

### For Developers/External Apps
Query the `loan_installments` table:
```sql
-- Get all installments for a loan transaction
SELECT * FROM loan_installments 
WHERE loan_transaction_id = '<transaction_id>'
ORDER BY installment_number;

-- Get pending installments
SELECT * FROM loan_installments 
WHERE status = 'pending'
ORDER BY due_date;

-- Get payment history for an installment
SELECT * FROM loan_transactions
WHERE remark LIKE '%<installment_id>%';
```

## API Endpoints

### GET /api/lms/installments
Fetch installments for a service transaction
- Query param: `transactionId`
- Returns: Array of installment records

### POST /api/lms/installment-payment
Record a payment against an installment
- Body: `{ installmentId, employeeId, paymentAmount, paymentMethod, paymentDate }`
- Updates: installment status and amount_paid
- Recalculates: loan current_balance

### POST /api/admin/create-installments
Run migration to create table and generate installments for existing loans

## Rollback (if needed)
```sql
DROP TABLE IF EXISTS loan_installments CASCADE;
```

## Commit
5d905e0 - Implement database-backed installment tracking system

# Database Migrations

This directory contains migration scripts for one-time database updates.

## Name Migration to Lowercase

### What it does
Converts all existing applicant `first_name` and `last_name` fields to lowercase to match the new naming convention where:
- **Saved**: Names are stored as lowercase in database
- **Displayed**: Names are shown as Uppercase (e.g., "John Smith") in the ledger

### How to run

#### Option 1: Via API Endpoint (Recommended for Production)

```bash
curl -X POST https://your-app.com/api/admin/migrate-names-lowercase \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json"
```

**Response Example:**
```json
{
  "success": true,
  "message": "Migration complete. Updated 42 applicants to lowercase names.",
  "updatedCount": 42,
  "totalProcessed": 45,
  "errors": null
}
```

#### Option 2: Via Local Script

Set environment variables:
```bash
export NEXT_PUBLIC_SUPABASE_URL="your_url"
export SUPABASE_SERVICE_ROLE_KEY="your_key"
export MIGRATION_ADMIN_KEY="your_admin_key"
```

Then run:
```bash
node scripts/migrate-names-lowercase.js
```

### Security

The API endpoint requires an admin key for authorization. Set the `MIGRATION_ADMIN_KEY` environment variable to enable migrations.

### After Migration

Once complete, the migration endpoint and scripts can be removed or left in place for future reference.

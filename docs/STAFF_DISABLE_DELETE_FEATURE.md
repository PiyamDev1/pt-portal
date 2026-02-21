# Staff Member Disable/Delete Feature - Implementation Guide

## Overview
This document describes the new staff member management feature that allows:
- **Managers** to temporarily disable/enable their team members
- **Super Admin** to permanently delete staff members from the system

## Database Migration

A migration file has been created to add the `is_active` field to the employees table:

**File:** `/scripts/migrations/20260221_add_is_active_to_employees.sql`

### What it does:
1. Adds `is_active` boolean column (default: `true`) to employees table
2. Creates an index for efficient filtering by active status
3. Prevents disabled employees from logging in

### How to apply:
Run this migration on your Supabase database using the service role key:

```bash
# Using psql directly with service role key
PGPASSWORD=your_password psql -h your-db.supabase.co -U postgres -d postgres \
  -f scripts/migrations/20260221_add_is_active_to_employees.sql
```

Or use Supabase SQL editor:
1. Go to your Supabase Dashboard
2. Go to SQL Editor
3. Run the migration file contents

## Features

### 1. Login Validation
**What happens:** When a disabled employee tries to log in, they receive the message:
> "Your account has been disabled. Contact your administrator for access."

**Code location:** `/app/login/page.tsx` (lines 21-25)

The login flow now checks `is_active` status before allowing access.

### 2. Disable/Enable Employee
**Permission:** Managers and Super Admin

**Access:**
- Managers can disable/enable their direct reports and team members
- Super Admin can disable/enable anyone

**How to use:**
1. Go to Dashboard → Settings → Staff Management
2. Find the employee in the list
3. Click **Disable** (for active employees) or **Enable** (for disabled ones)
4. Confirm when prompted
5. The list updates immediately with status badges

**Visual indicators:**
- Disabled employees appear **grayed out** with a **red "Disabled" badge**
- Active employees show a **green "Active" badge**
- Disabled employee names are **struck through**

**API Endpoint:** `POST /api/admin/disable-enable-employee`

```typescript
// Request body
{
  employeeId: string,     // ID of employee
  isActive: boolean       // true to enable, false to disable
}

// Response
{
  success: boolean,
  message: string,
  isActive: boolean
}
```

**Authorization:**
- Only managers of the employee or Super Admin can perform this action
- Prevents self-disabling (you cannot disable your own account)
- Returns 403 Forbidden if unauthorized

### 3. Delete Employee (Super Admin Only)
**Permission:** Super Admin ONLY

**What happens:**
- Employee record is permanently removed from the database
- Employee cannot ever log in again (Auth user is marked as deleted)
- No recovery possible - this is irreversible

**How to use:**
1. Go to Dashboard → Settings → Staff Management
2. Find the employee in the list (Super Admin only sees Delete button)
3. Click **Delete**
4. A confirmation dialog appears asking to type the employee's email
5. Type the email address exactly as shown
6. Click **Permanently Delete**
7. Employee is removed instantly

**Safety features:**
- Email confirmation required (must match exactly)
- Cannot delete your own account
- Clear warning message shown
- Only Super Admin can access this feature
- Logged in audit trail with timestamp and admin email

**Delete Button visibility:**
- ✅ Visible ONLY to Super Admin (Master Admin role)
- ❌ Not visible to regular Admins
- ❌ Not visible to Managers
- ❌ Not visible to regular staff

**API Endpoint:** `POST /api/admin/delete-employee`

```typescript
// Request body
{
  employeeId: string,     // ID of employee to delete
  confirmEmail: string    // Employee's email (must match)
}

// Response
{
  success: boolean,
  message: string,
  deletedEmployee: {
    id: string,
    email: string,
    name: string
  }
}
```

**Authorization:**
- Only Super Admin (Master Admin role) can call this endpoint
- Any other role gets 403 Forbidden response
- Request is logged with super admin's email

## UI Components

### Staff Tab (`/app/dashboard/settings/components/StaffTab.tsx`)

The Staff Management table now shows:

| Column | Details |
|--------|---------|
| Name | Employee name with email (struck through if disabled) |
| Role | Employee's role in the system |
| Branch | Assigned location |
| Department | Assigned department |
| **Status** | **NEW** - Shows "Active" (green) or "Disabled" (red) badges |
| Action | Buttons: Edit, Reset, Disable/Enable, **Delete** (super admin only) |

### Action Buttons
- **Edit** - Modify role, branch, department
- **Reset** - Send temporary password email
- **Disable/Enable** - Toggle active status (managers + super admin)
- **Delete** - Permanently remove (super admin only)

### Delete Confirmation Dialog
When clicking Delete:
1. Action row expands to show confirmation section
2. Red warning box appears with instructions
3. User must type employee's email to confirm
4. Two buttons: "Permanently Delete" and "Cancel"
5. Delete button is disabled until email matches exactly

## Code Architecture

### API Endpoints

#### 1. Disable/Enable Endpoint
**File:** `/app/api/admin/disable-enable-employee/route.js`

Features:
- Authorization check: Manager or Super Admin
- Manager hierarchy validation (can manage own reports)
- Prevents self-disabling
- Updates `is_active` field in employees table

Security:
- Session validation required
- Role verification
- Hierarchical permission checking
- Detailed logging

#### 2. Delete Endpoint
**File:** `/app/api/admin/delete-employee/route.js`

Features:
- Super Admin ONLY authorization
- Email confirmation required
- Prevents self-deletion
- Deletes employee record from database
- Marks Supabase Auth user as deleted
- Comprehensive audit logging

Security:
- Super Admin role verification only
- Email address verification (double confirmation)
- Does not allow deleting yourself
- Logs action with admin email and timestamp
- Returns clear error messages for security violations

### Database Changes

**New Column:** `employees.is_active`
- Type: `boolean`
- Default: `true` (all new employees are active)
- Indexed for efficient queries
- Used by login validation

**Index:** `idx_employees_is_active`
- Speeds up queries filtering by active status
- Used in login checks and staff listings

## Testing Checklist

### Test Disable/Enable Feature
- [ ] Log in as a manager with team members
- [ ] In Staff Management, click Disable on a team member
- [ ] Verify employee appears grayed out with "Disabled" badge
- [ ] Try to log in as that disabled employee (should get error message)
- [ ] Log in as original manager, click Enable on the employee
- [ ] Disabled employee should now be able to log in again
- [ ] Try to disable yourself (should show error)

### Test Delete Feature
- [ ] Log in as Super Admin
- [ ] Go to Staff Management
- [ ] Verify Delete buttons only appear for Super Admin
- [ ] Log in as regular Admin (not Super Admin)
- [ ] Verify Delete buttons do NOT appear
- [ ] As Super Admin, click Delete on an employee
- [ ] Try to cancel (dialog should close)
- [ ] Click Delete again and type wrong email (button stays disabled)
- [ ] Type correct email and click Delete
- [ ] Employees list updates (employee disappears)
- [ ] Try to log in as deleted employee (should get error)

### Test Authorization
- [ ] As Manager, try to disable non-team members (should fail)
- [ ] As Manager, try to delete someone (Delete button not visible)
- [ ] As Admin, try to delete someone (Delete button not visible)
- [ ] Call delete API directly as Admin (should get 403 error)

### Test Edge Cases
- [ ] Disable, then re-enable the same employee multiple times
- [ ] Delete an employee who hasn't logged in yet
- [ ] Try to delete your own account as Super Admin (should prevent)
- [ ] Disable all managers except one (verify they can still manage)

## Environment Variables
None new required - uses existing Supabase configuration

## Error Handling

### Common Error Messages

**Login Errors:**
- "Your account has been disabled. Contact your administrator for access."
  - User is disabled (is_active = false)
  - Solution: Manager or Super Admin must re-enable them

**Disable/Enable Errors:**
- "Unauthorized: Only managers or super admin can disable/enable employees"
  - Caller doesn't have permission
  - Solution: Must be manager or Super Admin

- "Cannot disable your own account"
  - Trying to disable yourself
  - Solution: Ask another manager/admin

**Delete Errors:**
- "Forbidden: Only Super Admin can delete employees"
  - Only Master Admin role can delete
  - Solution: Ask Super Admin to perform deletion

- "Email confirmation does not match employee email"
  - Typed email doesn't match
  - Solution: Type the exact email shown

- "Cannot delete your own account"
  - Trying to delete yourself
  - Solution: Ask another Super Admin

## Audit & Logging

All actions are logged:

### Disable/Enable
```
[disable-enable-employee] john.doe@company.com disabled employee john-smith-id
[disable-enable-employee] john.doe@company.com enabled employee john-smith-id
```

### Delete
```
🗑️  [delete-employee] SUPER ADMIN john.doe@company.com deleted employee jane.smith@company.com (Jane Smith)
```

Logs include:
- Timestamp
- Admin's email who performed action
- Employee affected
- Action taken

## Future Enhancements

Potential improvements for future versions:
1. Disable date and reason tracking (when/why disabled)
2. Re-enable deadline (auto-enable after X days)
3. Bulk disable/enable operations
4. Activity timeline showing who disabled/enabled when
5. Email notification to managers when their report is disabled
6. Archive instead of delete (soft delete with recovery option)
7. Disable scheduling (disable at future date)

## FAQ

**Q: Can disabled employees access data in the database?**
A: No, they cannot log in at all. The check happens during login, so Supabase Auth rejects them.

**Q: What happens to their old records and data?**
A: When disabled, all their past records remain in the database (applications, timeclock, etc.). When deleted, only the employee record is removed - associated data remains for audit purposes.

**Q: Can a manager disable another manager?**
A: A manager can only disable their direct reports or people below them in the hierarchy. They cannot disable their peers or superiors.

**Q: Is there a way to recover a deleted employee?**
A: No. Deletion is permanent. You would need to create a new employee account if they need to return.

**Q: Who can see disabled employees in the staff list?**
A: Everyone can see them (with visual "Disabled" badge). They just can't log in.

**Q: What if I disable the last super admin?**
A: You cannot disable yourself, so you're safe. But if you have only one Super Admin and disable everyone else, that admin can enable people again.

## Support

For issues or questions:
1. Check auth flow in `/app/login/page.tsx`
2. Check StaffTab component in `/app/dashboard/settings/components/StaffTab.tsx`
3. Review API endpoints in `/app/api/admin/` directory
4. Check database migration in `/scripts/migrations/20260221_add_is_active_to_employees.sql`

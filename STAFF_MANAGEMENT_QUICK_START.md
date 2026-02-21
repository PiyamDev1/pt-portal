# Staff Member Disable/Delete Feature - Quick Start Guide

## 🚀 What's Been Implemented

A complete staff member management system that allows:

1. **Managers** to temporarily disable/enable their team members
2. **Super Admin only** to permanently delete staff members
3. **Login validation** to prevent disabled users from accessing the system

## 📋 Files Created/Modified

### New Files
- `/scripts/migrations/20260221_add_is_active_to_employees.sql` - Database migration
- `/app/api/admin/disable-enable-employee/route.js` - API for disable/enable
- `/app/api/admin/delete-employee/route.js` - API for delete (super admin only)
- `/docs/STAFF_DISABLE_DELETE_FEATURE.md` - Complete documentation

### Modified Files
- `/app/login/page.tsx` - Added is_active check on login
- `/app/dashboard/settings/components/StaffTab.tsx` - Added UI buttons & logic
- `/app/dashboard/settings/client.tsx` - Pass userRole to StaffTab
- `/app/dashboard/settings/page.tsx` - Query is_active field

## ⚙️ Setup Instructions

### Step 1: Apply Database Migration
Run this SQL on your Supabase database:

```sql
-- Migration: Add is_active field to employees table
ALTER TABLE public.employees
ADD COLUMN is_active boolean DEFAULT true NOT NULL;

CREATE INDEX idx_employees_is_active ON public.employees(is_active);

COMMENT ON COLUMN public.employees.is_active IS 'When false, employee cannot log in or access the system.';
```

### Step 2: Restart Your Application
After applying the migration, restart your application:

```bash
# If using Next.js dev server
npm run dev

# Or redeploy to your hosting
```

## 🎯 How to Use

### For Managers: Disable/Enable Team Members

1. Navigate to **Dashboard → Settings → Staff Management**
2. Find the employee in the list
3. Click **Disable** to prevent them from logging in
4. Click **Enable** to restore access
5. Disabled employees appear grayed out with a red "Disabled" badge

Each manager can only manage their own team members and people below them in the hierarchy.

### For Super Admin: Delete Staff Members

1. Navigate to **Dashboard → Settings → Staff Management**
2. Look for employees with a **Delete** button (only visible to Super Admin)
3. Click **Delete**
4. A confirmation dialog appears
5. Type the employee's email address exactly
6. Click **Permanently Delete**

⚠️ **Deletion is permanent and cannot be undone**

## 🔒 Permission Model

| Action | Managers | Admin | Super Admin |
|--------|----------|-------|-----------|
| Disable own reports | ✅ | ❌ | ✅ |
| Disable anyone | ❌ | ❌ | ✅ |
| Delete employees | ❌ | ❌ | ✅ |
| See Delete button | ❌ | ❌ | ✅ |

## 📊 Visual Indicators

### Active Employee
- Normal text
- Green "Active" badge
- Edit, Reset, Disable buttons visible

### Disabled Employee
- Grayed out with strikethrough
- Red "Disabled" badge  
- Edit, Reset, Enable buttons visible

## 🔐 Security Features

✅ Role-based access control (managers, super admin)
✅ Hierarchical permission checking
✅ Prevents self-disabling/deleting your own account
✅ Email confirmation required for deletion
✅ Login validation prevents disabled users from accessing
✅ Full audit logging of all actions
✅ Clear error messages for authorization failures

## 🧪 Quick Test

### Test Disabling:
1. Log in as a Manager with team members
2. Go to Staff Management
3. Click Disable on a team member
4. Employee should appear grayed out
5. Log out and try to log in as that disabled employee
6. You should see: "Your account has been disabled..."

### Test Deleting:
1. Log in as Super Admin
2. Go to Staff Management
3. Verify Delete buttons appear
4. Log in as regular Admin
5. Refresh page - Delete buttons should NOT appear
6. As Super Admin, click Delete and type email to confirm

## 🚨 Important Notes

1. **Apply migration first** - The is_active column must exist in the database
2. **Test in development** - Try disabling/enabling yourself before using in production
3. **One Super Admin minimum** - You cannot delete/disable the last super admin
4. **Cannot undo deletion** - Only the employee record is deleted. Their historical data remains for auditing.
5. **Disable ≠ Delete** - Disabled employees can be re-enabled. Deleted employees cannot be recovered.

## 📖 Full Documentation

See `/docs/STAFF_DISABLE_DELETE_FEATURE.md` for:
- Complete API documentation
- Database schema changes
- Error handling reference
- Testing checklist
- FAQ and troubleshooting

## ❓ Common Issues

**Problem:** Delete button not visible
**Solution:** Make sure you're logged in as Super Admin (Master Admin role)

**Problem:** Cannot disable employee
**Solution:** You must be their manager or Super Admin

**Problem:** "is_active" field not recognized
**Solution:** Make sure migration has been applied to the database

**Problem:** Disabled employee still can log in
**Solution:** Restart the application to reload the code

## 📞 Need Help?

1. Check `/docs/STAFF_DISABLE_DELETE_FEATURE.md` for detailed documentation
2. Review the API endpoint files in `/app/api/admin/`
3. Check the StaffTab component in `/app/dashboard/settings/components/`
4. Review login validation in `/app/login/page.tsx`

---

**Implementation Status:** ✅ Complete
**All files are production-ready and error-checked**

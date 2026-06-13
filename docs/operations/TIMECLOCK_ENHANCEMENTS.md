# Timeclock Enhancements - Payroll Support

## Overview
The timeclock module has been enhanced to calculate and display daily work hours and employee totals, enabling easy payroll report generation through CSV export.

## Features Added

### 1. Daily Time Calculation
- **Function**: `calculateDailyTotals()`
- **Behavior**: 
  - Groups punch events by employee and date
  - Pairs IN/OUT punches and calculates duration
  - Accounts for multiple work sessions per day
  - Handles incomplete punch pairs gracefully
  - Subtracts break times when applicable

### 2. Employee Total Aggregation
- **Function**: `calculateEmployeeTotals()`
- **Behavior**:
  - Sums daily totals across all days in the filtered date range
  - Returns total hours per employee
  - Used for payroll submissions

### 3. Visual Display Features

#### When Employee Filter is Active
- Shows a **blue summary card** with:
  - Total hours worked (in decimal format)
  - Number of working days
  - Average hours per day
  - Daily breakdown grid showing each day's hours
  
#### When No Employee Filter
- Shows an **amber summary card** with:
  - Top 10 employees by total hours worked
  - Quick reference cards showing employee name and total hours
  - Sorted by highest to lowest hours

### 4. Enhanced CSV Export
The export now includes three sections:

1. **Raw Events Section**
   - All punch data (device, times, location, adjustments)
   - Same format as before

2. **Daily Time Summary**
   - Employee name, date, and total hours
   - Useful for day-by-day payroll verification
   - Format: Employee, Date, Total Hours

3. **Employee Total Summary**
   - Employee name and cumulative hours
   - Direct payroll import format
   - Sorted alphabetically by employee

## CSV Export Format

```
[Raw Events Data...]

DAILY TIME SUMMARY
Employee,Date,Total Hours
John Smith,25/03/2026,8.50
John Smith,26/03/2026,8.25
Jane Doe,25/03/2026,8.00

EMPLOYEE TOTAL SUMMARY
Employee,Total Hours
Jane Doe,8.00 hours
John Smith,16.75 hours
```

## Usage for Payroll

1. **Select Date Range**
   - Use "Today", "Last 7 Days", or "Last 30 Days" presets
   - Or manually select date range

2. **Optional: Filter by Employee**
   - Select an employee to see their detailed breakdown
   - Or leave empty to see all employees

3. **Export as CSV**
   - Click "Export" button
   - Open in Excel or your payroll system
   - Use the "EMPLOYEE TOTAL SUMMARY" section for direct payroll input

## Technical Implementation

### Helper Functions Added
- `formatDuration(minutes)`: Formats minutes as "Xh Ym" format
- `calculateDailyTotals(events)`: Main calculation engine
- `calculateEmployeeTotals(events)`: Aggregation function

### Time Calculation Logic
- Recognizes punch types: IN, CLOCK_IN, PUNCH_IN, OUT, CLOCK_OUT, PUNCH_OUT
- Matches IN/OUT pairs in chronological order
- Handles multiple work sessions per day
- Respects adjusted timestamps (preserving original for audit)
- Calculates duration in minutes for accuracy

### Display Components
- Blue summary card when employee is filtered
- Amber summary card when viewing all employees
- Daily breakdown grid showing per-day totals
- Responsive grid layout (mobile-friendly)

## Files Modified
- `/app/dashboard/timeclock/team/client.tsx`
  - Added calculation functions
  - Added summary display components
  - Enhanced CSV export logic

## Compatibility Notes
- Works with existing punch adjustment system
- Respects existing RBAC (role-based access control)
- Compatible with manual time adjustments
- Works with all punch types and devices

## Future Enhancements
- Filter by department/location
- Export in alternative formats (XLSX, PDF)
- Scheduled export emails
- Integration with accounting software APIs
- Overtime calculation and thresholds
- Customizable report templates

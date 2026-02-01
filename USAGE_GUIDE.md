# 📚 PT-Portal User Guide

## Complete Guide to Using the PT-Portal Application

This guide explains how to use every feature in the PT-Portal application step-by-step.

---

## 🏠 Dashboard Overview

When you log in, you'll see the main dashboard with several sections:

### Navigation Menu (Left Sidebar)
- **Dashboard**: Overview and quick stats
- **Applications**: View submitted applications
  - NADRA Services
  - Pakistani Passports
  - GB Passports
  - Visa Services
- **LMS** (Loan Management System): Payment tracking and management
- **Pricing**: Configure service prices
- **Settings**: System configuration and employee management

---

## 👤 Account Management

### Accessing Your Account
1. Click your name/profile icon (top right)
2. Select **Account Settings**

### What You Can Do Here
- View your profile information
- Update personal details
- Manage password and 2FA (Two-Factor Authentication)
- View account history

---

## 📋 Applications Dashboard

### View All Applications
1. Go to **Applications** in the sidebar
2. Choose the application type:
   - **NADRA Services**: Identity documents and services
   - **Pakistani Passports**: Passport applications
   - **GB Passports**: UK passport services
   - **Visa Services**: Visa applications

### Application Status States
| Status | Meaning |
|--------|---------|
| **Draft** | Application started but not submitted |
| **Submitted** | Application sent, awaiting processing |
| **In Progress** | Currently being processed |
| **Under Review** | Being reviewed by staff |
| **Approved** | Application approved, ready for issuance |
| **Rejected** | Application was rejected, see notes |
| **Completed** | Application fully completed |

### Filtering Applications
- **Search**: Enter customer name, application ID, or reference number
- **Status Filter**: Select specific status to view
- **Date Range**: Filter by submission date
- **Branch Filter**: View applications from specific branch

### Application Actions
Click on any application to:
- **View Details**: See full application information
- **Edit**: Modify application (if status allows)
- **Add Notes**: Add internal notes
- **Change Status**: Update application progress
- **Download**: Export application as PDF
- **Delete**: Remove application (admin only)

---

## 💳 NADRA Services

### Managing NADRA Applications

#### Add New Application
1. Go to **Applications > NADRA Services**
2. Click **+ Add New Application**
3. Enter customer information:
   - Full name
   - CNIC (ID number)
   - Service type (see table below)
   - Service option
4. Click **Submit**

#### NADRA Service Types
| Service | Description |
|---------|-------------|
| **CNICs** | CNIC issuance and renewal |
| **Family Registration** | Family registration certificates |
| **Forms** | Various NADRA forms |
| **Reports** | Official reports and documents |

#### Update Status
1. Select application from list
2. Click **Status** button
3. Choose new status from dropdown
4. Add comments (optional)
5. Click **Update**

#### View Status History
1. Select application
2. Click **View History**
3. See all status changes with dates and notes

---

## 🛂 Passport Management

### Pakistani Passport

#### Application Process
1. Go to **Applications > Pakistani Passports**
2. Click **+ New Application**
3. Fill in:
   - Customer details
   - Passport type (Regular/Urgent)
   - Number of pages (24/36/48)
4. Submit

#### Manage Records
1. Select customer from **Manage Records**
2. Update custody (who has the physical passport)
3. Set renewal date
4. Add notes

#### Track Status History
1. Select application
2. Click **Status History**
3. View all updates in chronological order

---

## 🌍 UK (GB) Passport Services

#### Create GB Passport Application
1. Go to **Applications > GB Passports**
2. Click **+ New Application**
3. Select:
   - Age group (Child/Adult)
   - Number of pages (28/32/48)
   - Service type (Standard/Express)
4. Enter applicant details
5. Submit

#### Track Processing
- View estimated processing date
- See current stage in pipeline
- Update with courier information when sent
- Mark as received/delivered

---

## ✈️ Visa Services

### Visa Application Management

#### Submit New Visa Application
1. Go to **Applications > Visa Services**
2. Click **+ Add Application**
3. Fill in:
   - Customer name
   - Destination country
   - Visa type (Tourist/Business/Student/etc.)
   - Travel dates
   - Number of entries
4. Upload required documents:
   - Passport copy
   - Travel plan
   - Financial documents (as needed)
5. Submit

#### Visa Application Status
- **Submitted**: Application received
- **Documents Verified**: Documents checked
- **Approved**: Visa approved by embassy
- **Issued**: Visa sticker received, ready for delivery
- **Delivered**: Passport returned to customer

#### Request Visa Services
- Track embassy responses
- Request expedited processing
- Add special requirements/notes

---

## 💰 Loan Management System (LMS)

The LMS tracks all financial transactions, payments, and loan management.

### Dashboard Overview
The LMS dashboard shows:
- **Total Active Accounts**: Number of active loan accounts
- **Total Outstanding Balance**: Total amount owed
- **Average Payment**: Average payment amount
- **Overdue Accounts**: Accounts with late payments

### Customer Accounts

#### Search & Filter
1. Go to **LMS** from dashboard
2. Use search to find customer by:
   - Name
   - Account ID
   - Phone number
   - CNIC
3. Use filters:
   - Status (Active/Inactive/Defaulted)
   - Balance range
   - Payment status

#### View Account Details
Click on a customer account to see:
- **Account Information**
  - Customer name and contact
  - Account opening date
  - Total credit limit
- **Balance Summary**
  - Current balance
  - Available credit
  - Last payment date
- **Transactions**: All payments and charges
- **Installments**: Active payment plans
- **Payment Methods**: Saved payment methods

---

## 📊 Payments & Transactions

### Make Payment
1. Select customer account
2. Click **Add Payment**
3. Enter:
   - Payment amount
   - Payment date
   - Payment method (Cash/Card/Bank Transfer/Check)
   - Reference number
4. Click **Submit**

### View Payment History
1. Open customer account
2. Go to **Transactions** tab
3. See all payments with:
   - Date
   - Amount
   - Method
   - Balance after payment

### Payment Methods
| Method | Details |
|--------|---------|
| **Cash** | Direct cash payment |
| **Card** | Credit/debit card payment |
| **Bank Transfer** | Account-to-account transfer |
| **Check** | Check payment (post-dated acceptable) |
| **Online** | Credit/debit card online |

---

## 📑 Installment Plans

### Create Installment Plan
1. Select customer account
2. Click **Create Installment Plan**
3. Enter:
   - Total amount to finance
   - Number of installments
   - Interest rate (if applicable)
   - Start date
4. System calculates monthly payment
5. Click **Create**

### View Active Plans
1. Open customer account
2. Go to **Installments** tab
3. See:
   - Plan details
   - Payment schedule
   - Paid vs. remaining payments
   - Next payment date

### Modify Plan
1. Select active installment plan
2. Options available:
   - **Extend**: Add months to plan
   - **Defer**: Skip next payment (with conditions)
   - **Early Payoff**: Pay remaining balance
   - **Restructure**: Change payment amounts

---

## 💵 Pricing Management

The Pricing module allows you to configure service prices.

### Access Pricing
1. Go to **Settings > Pricing**
2. Select service type tab:
   - **NADRA Services**
   - **Pakistani Passport**
   - **GB Passport**
   - **Visa Services**

### Pricing Structure
For each service, you set:
- **Cost Price**: Your cost to provide service
- **Sale Price**: Price charged to customer
- **Margin**: Automatically calculated (Sale - Cost)
- **Active**: Whether service is offered

### Add New Price
1. Click **Add New** in selected tab
2. Enter:
   - Service details (type, category, options)
   - Cost price
   - Sale price
3. Click **Save**

### Edit Existing Price
1. Find service in list
2. Click **Edit** button
3. Update prices
4. Click **Save**

### Delete Price
1. Find service
2. Click **Delete** (confirm required)
3. Service no longer available

### Example: NADRA Pricing
```
Service Type: CNICs
Service Option: Regular Issuance
Cost Price: 500 PKR
Sale Price: 1,500 PKR
Margin: 1,000 PKR (67%)
```

---

## ⚙️ Settings & Administration

### User Management
1. Go to **Settings**
2. Click **Employee Management**
3. View all employees with:
   - Name
   - Role (Admin/Staff/Manager)
   - Department
   - Status (Active/Inactive)

#### Add New Employee
1. Click **Add Employee**
2. Enter:
   - Name
   - Email
   - Phone
   - Role
   - Department
   - Branch
3. System sends invite link
4. Employee creates password

#### Edit Employee
1. Click employee name
2. Update information
3. Save changes

#### Deactivate Employee
1. Select employee
2. Click **Deactivate**
3. Employee loses login access

### Branch Management
1. Go to **Settings > Branches**
2. View all branches:
   - Name
   - City
   - Manager
   - Contact info

#### Add Branch
1. Click **Add Branch**
2. Enter branch details
3. Assign manager
4. Save

### Security Settings
1. Go to **Settings > Security**
2. Options:
   - **Password Policy**: Require strong passwords
   - **Session Timeout**: Auto-logout after inactivity
   - **Two-Factor Authentication**: Require 2FA for logins
   - **Activity Logging**: Log all user actions

---

## 📈 Reports & Analytics

### Generate Reports
1. Go to **Reports** (if available)
2. Choose report type:
   - **Sales Report**: Revenue by service
   - **Application Report**: Applications by type/status
   - **Payment Report**: Payment history
   - **Customer Report**: Customer list with balances

### Report Options
- **Date Range**: Select period (daily/weekly/monthly)
- **Filter**: By branch, service type, status
- **Export**: Download as PDF or Excel

### Export Data
Most tables allow export:
1. Click **Export** button
2. Choose format:
   - PDF (formatted document)
   - CSV (spreadsheet)
   - Excel (formatted spreadsheet)

---

## 🔐 Security Best Practices

### Password Management
- ✅ Use strong passwords (mix of letters, numbers, symbols)
- ✅ Change password every 90 days
- ✅ Never share your password
- ❌ Don't use common words or birthdates

### Two-Factor Authentication (2FA)
1. Go to **Account Settings**
2. Click **Enable 2FA**
3. Scan QR code with authenticator app (Google Authenticator/Microsoft Authenticator)
4. Enter code to confirm
5. Save backup codes in safe location

### Session Security
- ✅ Always log out when finished
- ✅ Don't use on public/shared computers
- ✅ Clear browser cache before leaving
- ✅ Use HTTPS (application enforces this)

---

## 💡 Tips & Tricks

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+/` | Show all shortcuts |
| `Ctrl+K` | Search anything |
| `Escape` | Close modal/dialog |
| `Tab` | Move to next field |
| `Shift+Tab` | Move to previous field |

### Quick Navigation
- Click logo to go to dashboard
- Click your name for account menu
- Click notifications icon for alerts

### Bulk Actions
- Select multiple items with checkboxes
- Use bulk action dropdown
- Export multiple records at once

### Sorting & Filtering
- Click column headers to sort
- Click filter icon for advanced options
- Save filters as favorites for quick access

---

## ❓ Frequently Asked Questions

### Q: How do I reset my password?
**A:** Click "Forgot Password" on login page, enter email, follow reset link sent to inbox.

### Q: How long does application processing take?
**A:** Varies by type:
- NADRA: 1-3 business days
- Passport: 5-10 business days
- Visa: 7-15 business days (depending on country)

### Q: Can I edit submitted applications?
**A:** Not after submission (prevents fraud). Contact admin to modify.

### Q: How do I download invoices?
**A:** From account view, click **Download Invoice**. Only available for completed transactions.

### Q: What payment methods are accepted?
**A:** Cash, debit/credit card, bank transfer, and checks.

### Q: How do I add notes to an application?
**A:** Open application, click **Add Note**, type note, click **Save**.

### Q: Can I cancel an application?
**A:** Yes, if status is "Draft". Otherwise, contact administrator.

### Q: How are installments calculated?
**A:** Total ÷ Number of Months = Monthly Payment (+ interest if applicable)

---

## 🆘 Troubleshooting

### I can't log in
- Verify email address and password are correct
- Check Caps Lock is off
- Try "Forgot Password" if password not remembered
- Contact admin if account locked

### Data not showing up
- Refresh page (Ctrl+R or Cmd+R)
- Check filters (you might have filtered out data)
- Wait a moment (data may still loading)
- Try different date range

### Can't submit application
- Check all required fields are filled (marked with *)
- Verify upload files are correct format
- Check file sizes aren't too large
- Try refreshing and resubmitting

### Payment not recorded
- Check payment appears in "Transactions"
- Verify amount and date are correct
- Wait 1-2 minutes (may need refresh)
- Contact admin if still missing

### Slow performance
- Close other browser tabs
- Clear browser cache
- Disable browser extensions (especially ad blockers)
- Try different browser
- Check internet connection

---

## 📞 Support & Help

### Getting Support
- **Email**: support@ptportal.com
- **Phone**: +92-XXX-XXXXXXX
- **Live Chat**: Click help icon (bottom right)
- **Knowledge Base**: Help > Articles

### Providing Feedback
1. Click **Feedback** button
2. Describe issue/suggestion
3. Attach screenshot (optional)
4. Submit

### Report a Bug
1. Go to Help > Report Bug
2. Describe what happened
3. Include steps to reproduce
4. Submit with screenshot

---

## 📖 Additional Resources

- **Video Tutorials**: [YouTube Channel](https://youtube.com/ptportal)
- **Blog**: [Blog.ptportal.com](https://blog.ptportal.com)
- **API Documentation**: For developers
- **Mobile App**: [Download iOS/Android](https://ptportal.com/app)

---

**Last Updated**: February 2026

For the most current information, visit [PT-Portal Documentation](https://docs.ptportal.com)

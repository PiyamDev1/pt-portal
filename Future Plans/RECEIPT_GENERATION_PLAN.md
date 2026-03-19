# Receipt Generation Feature Implementation Plan

**Date Created:** March 19, 2026  
**Status:** Planning Phase  
**Priority:** Medium  

---

## Overview

Implement a comprehensive receipt generation system that creates copyable receipts for application submissions, refunds, and status changes. Receipts can be easily shared via WhatsApp, email, or other messaging platforms.

---

## Feature Scope

### Receipt Types Required

#### **NADRA Applications**
- Receipt for Application Submitted
- Receipt for Refund (when refunded)

#### **Pakistani Passports**
- Receipt for Application at Biometrics Submitted
- Receipt for Refund (when refunded)
- Receipt for Passport Collected/Returned

#### **British Passports**
- Receipt for Application Entered into System

---

## Implementation Architecture

### Database Schema

**Update to documents table:**
```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS receipt_type VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS service_type VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS receipt_pin VARCHAR(6);  -- For verification
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;
```

**Receipt-specific fields in service tables:**
- Store receipt generation timestamp in application records
- Track receipt access/share attempts in audit logs

### File Structure

```
lib/
├── services/
│   ├── receiptGenerator.ts       // Main receipt generation logic
│   ├── receiptTemplates.ts       // HTML templates for each service type
│   └── receiptValidation.ts      // PIN validation & verification

├── constants/
│   └── receiptConfig.ts          // Receipt styling, messages, settings

│app/api/
├── receipts/
│   ├── generate/route.ts         // POST: Create and store receipt
│   ├── verify/route.ts           // POST: Verify receipt PIN
│   ├── email/route.ts            // POST: Send receipt via email
│   └── list/route.ts             // GET: List all receipts for applicant

components/
├── ReceiptViewer.tsx             // Main modal/panel component
├── ReceiptTemplate.tsx           // Renderable HTML template
└── ReceiptActions.tsx            // Copy, download, share buttons

hooks/
├── useReceipt.ts                 // Fetch receipt data
├── useReceiptCopy.ts             // Copy to clipboard logic
└── useReceiptShare.ts            // Share intent handling
```

---

## Implementation Phases

### Phase 1: Receipt Data & Generation Engine
**Deliverables:**
- Receipt data structures for each service type
- HTML template system with Tailwind styling
- Pricing data integration from existing tables
- QR code generation for tracking number verification
- Random 6-digit PIN generation for receipt verification

**Key Components:**
- Receipt contains: Application details, pricing breakdown, tracking number, QR code, PIN, timestamp
- Template includes: Service type badge, applicant info, dates, amounts, verification code
- Auto-generated on status changes to submission/completion states

### Phase 2: UI & Copy Functionality
**Deliverables:**
- Receipt viewer component (modal/side panel)
- Image capture using `html2canvas` library
- Copy to clipboard (PNG format)
- Download options (PNG, PDF)
- Share buttons (WhatsApp, Email, generic share)

**User Experience:**
- One-click copy to clipboard
- Visual feedback on successful copy
- Mobile-responsive design
- Preview before copying

### Phase 3: Integration & Automation
**Deliverables:**
- Hook into status update endpoints to auto-generate receipts
- Hook into refund endpoints to generate refund receipts
- Store receipt records in documents table
- Receipt history tracking per applicant

**Triggers:**
- NADRA: "Submitted", "Cancelled" (refund) status
- PK Passport: "BiometricsTaken", "Collected", "Cancelled" (refund)
- GB Passport: "Pending Submission" (initial entry)

### Phase 4: Advanced Features (Optional)
**Deliverables:**
- Email delivery (async job queue)
- WhatsApp integration (if using Twilio/similar)
- SMS tracking number delivery
- Receipt verification endpoint
- Email templates with styling
- Receipt archive/batch download

---

## Feature Improvements & Ideas

### High Priority

1. **✅ QR Code for Tracking**
   - Embeds tracking number
   - Links to application status page
   - Auto-scan capability for staff verification

2. **✅ Receipt PIN Verification**
   - 6-digit PIN on receipt
   - Verification endpoint for authenticity check
   - Prevents fraudulent copies
   - Displayed in small font on receipt

3. **✅ Pricing Breakdown**
   - Display cost_price and sale_price
   - Markup/profit margin visibility (admin view)
   - Payment status indicator
   - Reference number for finance reconciliation

4. **✅ WhatsApp Share Integration**
   - Direct WhatsApp share button
   - Pre-filled message template
   - Service-specific templates ("Your NADRA CNIC receipt...", etc.)
   - One-click send to applicant

5. **✅ Email Share Option**
   - Generate email template with embedded receipt
   - Auto-populate applicant email
   - Send directly from receipt view
   - Confirmation receipt on email

### Medium Priority

6. **✅ Customizable Receipt Templates**
   - Company branding (header/footer)
   - Language options (English/Urdu)
   - Service-specific layouts
   - Admin template editor

7. **✅ Receipt History**
   - View all past receipts for applicant
   - Filter by service type, date range
   - Re-download any past receipt
   - Batch download (ZIP format)

8. **✅ Mobile-First Design**
   - Optimized for smartphone viewing
   - Full-screen receipt preview
   - Gesture-based copy (long-press)
   - Print-friendly CSS

9. **✅ Autocomplete Applicant Phone**
   - Pre-populate from application record
   - One-click WhatsApp share
   - SMS delivery option

10. **✅ Audit Trail**
    - Log all receipt generations (timestamp, user, applicant)
    - Track share/copy events
    - Immutable database records
    - Compliance reporting

### Low Priority / Future

11. **SMS Delivery** - Send via SMS gateway
12. **Multi-language Support** - Urdu, Arabic, etc.
13. **Receipt Analytics** - Track which receipts get shared
14. **Bulk Receipt Generation** - Generate for multiple applications
15. **Digital Signature** - Cryptographic verification

---

## Technical Stack

### Frontend Libraries
```json
{
  "html2canvas": "^1.4.1",    // Convert HTML to canvas/image
  "jspdf": "^2.5.1",           // PDF generation
  "qrcode.react": "^1.0.1",    // QR code component
  "date-fns": "^3.0.0",        // Date formatting
  "axios": "existing",         // HTTP requests
  "react-hot-toast": "existing" // Notifications
}
```

### Styling
- Tailwind CSS (existing)
- Custom receipt CSS for print media
- Responsive grid layout

### Backend
- Existing Node.js/Next.js API routes
- Service-role authentication
- MinIO document storage
- Supabase database

---

## Data Models

### Receipt Data Structure
```typescript
interface Receipt {
  id: string;
  documentId?: string;  // Reference to documents table
  applicationId: string;
  applicantId: string;
  applicantName: string;
  phone: string;
  email?: string;
  
  serviceType: 'nadra' | 'pk_passport' | 'gb_passport';
  receiptType: 'submission' | 'refund' | 'collection';
  
  trackingNumber: string;
  applicationPin: string;  // From application
  receiptPin: string;      // 6-digit verification PIN
  
  pricing: {
    serviceDescription: string;
    costPrice: number;
    salePrice: number;
    currency: string;
  };
  
  generatedAt: Date;
  generatedBy: string;    // User ID
  
  metadata: {
    qrCode: string;       // Base64 encoded
    company: string;
    branding?: Record<string, string>;
  };
}
```

### Status History Integration
```typescript
// Extend existing nadra_status_history, etc.
{
  entry_type: 'status' | 'refund' | 'complaint' | 'receipt_generated',
  receiptId?: string,
  receiptPin?: string
}
```

---

## API Endpoints

### Generate Receipt
```
POST /api/receipts/generate
Body: { applicationId: string, receiptType: string }
Returns: Receipt object + document reference
```

### Verify Receipt
```
POST /api/receipts/verify
Body: { trackingNumber: string, receiptPin: string }
Returns: { valid: boolean, message: string }
```

### Send Receipt Email
```
POST /api/receipts/email
Body: { receiptId: string, recipientEmail: string }
Returns: { sent: boolean, messageId?: string }
```

### List User Receipts
```
GET /api/receipts/list?applicantId=...&serviceType=...
Returns: Receipt[]
```

---

## UI Components Hierarchy

```
<ReceiptViewer>                 // Modal/panel wrapper
├── <Header>                    // Title, close button
├── <ReceiptTemplate>           // Renderable HTML
│   ├── <CompanyHeader>
│   ├── <ReceiptDetails>
│   ├── <PricingSection>
│   ├── <QRCodeSection>
│   └── <FooterWithPin>
├── <ReceiptActions>            // Buttons row
│   ├── [Copy to Clipboard]
│   ├── [Download PNG]
│   ├── [Download PDF]
│   ├── [Share WhatsApp]
│   ├── [Send Email]
│   └── [Print]
└── <ReceiptHistory>            // Toggle: past receipts
```

---

## Integration Points

### Status Update Triggers
**When to generate receipts:**

1. **NADRA:**
   - Status change to "Submitted" → Submission Receipt
   - Refund set to true → Refund Receipt

2. **Pakistani Passport:**
   - Status change to "BiometricsTaken" → Biometrics Receipt
   - Status change to "Collected" → Collection Receipt
   - Refund set to true → Refund Receipt

3. **British Passport:**
   - Status change to "Pending Submission" (creation) → Entry Receipt

### Auto-Email (Optional)
If enabled, async job to send email immediately after generation.

---

## Testing Strategy

### Unit Tests
- Receipt data generation
- PIN validation logic
- Price calculations
- QR code generation

### Integration Tests
- API endpoint creation/verification
- Database record insertion
- Email sending (mock)
- Status trigger logic

### E2E Tests
- Create application → receipt generation → copy flow
- Refund flow → receipt generation
- Receipt share to WhatsApp/email

---

## Success Metrics

1. **User Adoption:** % of users who copy/share receipts
2. **Support Reduction:** Decrease in "where's my receipt" queries
3. **Accuracy:** 100% accurate pricing on receipts
4. **Speed:** Receipt generation < 500ms
5. **Share Rate:** % shared via WhatsApp vs email vs copied

---

## Implementation Order

1. **Week 1:** Phase 1 - Receipt generator & templates
2. **Week 2:** Phase 2 - UI components & copy functionality
3. **Week 3:** Phase 3 - API integration & auto-generation
4. **Week 4:** Phase 4 - Email/WhatsApp, testing, deployment
5. **Ongoing:** Monitor, iterate on design based on feedback

---

## Dependencies & Prerequisites

- [ ] Confirm company branding guidelines for receipt
- [ ] Choose receipt layout style (professional, casual, etc.)
- [ ] Decide on email template design
- [ ] Set up WhatsApp integration (if using Twilio)
- [ ] Plan SMS gateway (if needed)
- [ ] Create user personas for UX testing

---

## Notes & Considerations

- Receipts are immutable once generated (don't update old ones)
- PINs should be regenerated if receipt is re-issued
- Consider GDPR/privacy when storing email/phone on receipts
- Receipt images must be high quality for printing
- Ensure mobile users can easily copy to clipboard
- QR codes should link to secure verification page
- Consider receipt retention/archival policy

---

## Related Features

- Application status tracking (existing)
- Pricing management (existing)
- Document storage via MinIO (existing)
- Email notifications system (may need enhancement)
- Audit logging system (may need extension)

---

## Approval & Sign-Off

**Proposed by:** AI Assistant  
**Date:** March 19, 2026  
**Status:** Ready for Review  
**Next Steps:** Get stakeholder approval and prioritize phases

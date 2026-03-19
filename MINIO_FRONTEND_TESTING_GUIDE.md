# Frontend Testing Guide - MinIO Document Management

Quick guide for testing the document management system without a real MinIO backend.

## 🧪 Testing Phases

### Phase 1: Component Rendering

Verify all components render without errors:

```bash
npm run dev
```

Navigate to: `http://localhost:3000/dashboard/applications/nadra`

**Test Checklist:**

- [ ] Nadra page loads without errors
- [ ] Document icon (📄) visible in table actions
- [ ] Click document icon navigates to documents page
- [ ] Document Hub page loads with header

### Phase 2: Component Interaction

**MinIO Status Component**

- [ ] Status bar displays on page load
- [ ] Automatic polling starts (check network tab -> documents/status)
- [ ] Manual refresh button works
- [ ] Status updates every 5 minutes

**Document Upload Component**

- [ ] Drag-and-drop zone displays
- [ ] "Browse files" button works
- [ ] File picker opens
- [ ] File validation works for:
  - [ ] Files larger than 1.5 MB show error
  - [ ] Invalid file types show error
  - [ ] Valid files can be selected
- [ ] Upload progress bar appears
- [ ] Success message appears after upload

**Document Grid Component**

- [ ] Empty state displays when no documents
- [ ] Grid is responsive:
  - [ ] Mobile: 1 column
  - [ ] Tablet: 2 columns
  - [ ] Desktop: 3-4 columns
- [ ] Hover actions appear on grid items
- [ ] Loading skeleton displays when loading

**Document Preview Panel**

- [ ] Empty state displays when no selection
- [ ] Clicking grid item selects and previews
- [ ] File metadata displays (name, size, date)
- [ ] Close button works
- [ ] Delete confirmation works
- [ ] Download button visible

### Phase 3: Navigation & Integration

**Nadra Table Integration**

- [ ] Document icon appears in table
- [ ] Document icon is purple (color-coded)
- [ ] Positioned correctly in actions column
- [ ] Click navigates to documents page with correct applicant ID

**Page Navigation**

- [ ] Back to Nadra Services link works
- [ ] URL shows correct applicant ID
- [ ] Breadcrumb displays correctly

### Phase 4: Responsive Design

Test on different screen sizes:

```bash
# Desktop (1920px)
# Tablet (768px)
# Mobile (375px)
```

**Checklist:**

- [ ] DocumentHub layout adapts:
  - [ ] Desktop: 2-column (upload/grid + preview)
  - [ ] Mobile: Single column
- [ ] All buttons touch-friendly on mobile
- [ ] Text readable at all sizes
- [ ] Images scale properly
- [ ] No horizontal scroll

### Phase 5: Error Handling

Test error scenarios:

**File Upload Errors**

- [ ] File size validation error message
- [ ] File type validation error message
- [ ] Missing applicant ID error
- [ ] Network error (simulate with Network tab in DevTools)

**MinIO Connection Errors**

- [ ] Status shows "Offline" when unreachable
- [ ] Error message displays
- [ ] Retry logic works (watch Network tab)
- [ ] Can still upload (doesn't depend on status check)

---

## 🧑‍💻 Manual Testing Script

### Test Case 1: Basic Upload Flow

**Steps:**

1. Navigate to Nadra Applications
2. Click document icon for any applicant
3. Wait for page to load (should see "Loading documents...")
4. In MinIO Status, verify it checks status
5. Drag a PDF file to upload zone
6. Progress bar appears
7. Success message appears
8. File appears in grid (simulated)

**Expected Result:** ✅ File appears in grid with thumbnail

### Test Case 2: File Validation

**Steps:**

1. Try to upload file larger than 1.5 MB
2. Try to upload .exe file
3. Try to upload valid .pdf file

**Expected Results:**

- [ ] Large file: Error "File size exceeds maximum"
- [ ] Invalid type: Error "File type not supported"
- [ ] Valid file: Uploads and shows in grid

### Test Case 3: Document Preview

**Steps:**

1. Upload an image file
2. Click on thumbnail in grid
3. Verify preview shows in right panel
4. Try zoom controls (if image)
5. Click download
6. Click delete with confirmation

**Expected Results:**

- [ ] Preview displays correctly
- [ ] Zoom buttons work
- [ ] Download button appears
- [ ] Delete shows confirmation
- [ ] After delete, grid removes image

### Test Case 4: Responsive Layout

**Steps:**

1. Open page in desktop view
2. Verify 2-column layout (70% / 30%)
3. Resize to tablet (768px)
4. Verify single column layout
5. Resize to mobile (375px)
6. Verify mobile optimizations

**Expected Results:**

- [ ] Layout adapts at each breakpoint
- [ ] No overflow/clipping
- [ ] Touch targets adequate size

### Test Case 5: Navigation

**Steps:**

1. From Nadra table, click document icon
2. Verify URL: `/dashboard/applications/nadra/documents/[applicantId]`
3. Verify applicant name displays
4. Click "Back to Nadra Services"
5. Verify returns to Nadra table

**Expected Results:**

- [ ] Correct applicant displayed
- [ ] URL contains applicant ID
- [ ] Back button returns to Nadra

---

## 🔧 Browser DevTools Testing

### Network Tab

- [ ] MinIO status check request: `/api/documents/status`
- [ ] List documents request: `/api/documents?applicantId=...`
- [ ] Upload request: `/api/documents/upload` (returns 501 by default)

**Expected Responses:**

```json
// GET /api/documents/status
{
  "success": true,
  "status": {
    "connected": false,
    "endpoint": "http://localhost:9000",
    "error": "Failed to connect",
    "timestamp": "2026-03-05T..."
  }
}

// GET /api/documents
{
  "success": true,
  "data": [],
  "message": "[PLACEHOLDER] No documents yet..."
}

// POST /api/documents/upload
{
  "success": true,
  "data": {
    "id": "doc-...",
    "fileName": "test.pdf",
    "fileSize": 12345,
    "minio": {
      "bucket": "nadra-documents",
      "key": "applicant-.../..."
    }
  }
}
```

### Console Tab

- [ ] No TypeScript errors
- [ ] No console errors
- [ ] No warnings except deprecation warnings
- [ ] Status check polling messages (if debugging enabled)

### Elements Tab

- [ ] Correct HTML structure
- [ ] Accessible ARIA labels
- [ ] Semantic HTML used
- [ ] Classes applied correctly

---

## 🎨 Visual Testing

### Design Consistency

- [ ] Colors match Tailwind scheme (blues, purples, grays)
- [ ] Spacing/padding consistent across components
- [ ] Icons render correctly
- [ ] Typography hierarchy clear

### Component States

- [ ] Normal state
- [ ] Hover state (buttons, grid items)
- [ ] Active state (selected items)
- [ ] Disabled state (during upload)
- [ ] Error state (validation messages)
- [ ] Loading state (skeleton loaders)
- [ ] Empty state (no documents)

### Accessibility

- [ ] Keyboard navigation works
- [ ] Tab order is logical
- [ ] Focus styles visible
- [ ] Color contrast adequate (WCAG AA)
- [ ] Form labels associated
- [ ] Images have alt text

---

## 📊 Performance Testing

### Metrics to Measure

```bash
# Core Web Vitals
# LCP (Largest Contentful Paint): < 2.5s
# FID (First Input Delay): < 100ms
# CLS (Cumulative Layout Shift): < 0.1
```

### Tools

**Lighthouse**

1. Open DevTools → Lighthouse
2. Click "Analyze page load"
3. Review scores for:
   - [ ] Performance (90+)
   - [ ] Accessibility (90+)
   - [ ] Best Practices (90+)

**Web Vitals**

1. Install extension: Web Vitals
2. Visit page
3. Check metrics in extension popup

### Performance Checklist

- [ ] Page loads in < 2s
- [ ] MinIO status check doesn't block UI
- [ ] Upload doesn't freeze interface
- [ ] Grid renders 50+ items smoothly
- [ ] Preview loads in < 1s
- [ ] No layout shifts during load

---

## 🐛 Debug Mode

Enable detailed logging by adding to browser console:

```javascript
// Enable request logging
localStorage.setItem('debug', 'true')

// Watch MinIO status checks
window.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/documents/status')) {
    console.log('Status check:', new Date().toISOString())
  }
})

// Monitor upload progress
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name.includes('/upload')) {
      console.log('Upload timing:', entry)
    }
  }
})
observer.observe({ entryTypes: ['resource'] })
```

---

## ✅ Sign-Off Checklist

- [ ] All components render without errors
- [ ] Navigation works (Nadra → Documents → Back)
- [ ] File upload validation works
- [ ] MinIO status updates automatically
- [ ] Document grid displays correctly
- [ ] Preview panel functions properly
- [ ] Responsive design works on all sizes
- [ ] No console errors
- [ ] Keyboard navigation works
- [ ] Performance metrics acceptable
- [ ] Accessibility standards met

---

## 📝 Bug Report Template

If you find issues during testing:

```markdown
**Component**: [MinioStatus/DocumentUpload/etc]
**Browser**: [Chrome/Firefox/Safari]
**Device**: [Desktop/Tablet/Mobile]
**Severity**: [Error/Warning/Minor]

**Steps to Reproduce**:

1.
2.
3.

**Expected Result**:

**Actual Result**:

**Screenshot/Video**:
```

---

## 🚀 Ready for Backend Integration?

All components have passed frontend testing when:

- ✅ No console errors
- ✅ All interactions work as expected
- ✅ Responsive design verified
- ✅ Accessibility requirements met
- ✅ Performance metrics acceptable

Next: Implement backend handlers to replace placeholder responses.

---

**Last Updated**: March 5, 2026

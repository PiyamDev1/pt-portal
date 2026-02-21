# Shared Components

This directory contains reusable UI components used across the application.

## Available Components

### `ModalBase`
A reusable modal/dialog component that provides consistent styling and behavior across the app.

**Usage:**
```tsx
import { ModalBase } from '@/components'

export function MyModal({ isOpen, onClose }) {
  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="My Modal Title"
      size="md"
      isLoading={false}
    >
      <p>Modal content goes here</p>
    </ModalBase>
  )
}
```

**Props:**
- `isOpen` (boolean) - Controls modal visibility
- `onClose` (function) - Called when modal should close
- `title` (string) - Modal header title
- `children` (ReactNode) - Modal body content
- `size` ('sm' | 'md' | 'lg') - Modal width. Default: 'md'
  - `sm`: 400px
  - `md`: 600px
  - `lg`: 800px
- `isLoading` (boolean) - Shows loading spinner. Default: false
- `header` (ReactNode) - Custom header content (overrides title)
- `footer` (ReactNode) - Custom footer content
- `closeOnEscape` (boolean) - Close on ESC key. Default: true
- `closeOnBackdropClick` (boolean) - Close when clicking outside. Default: true

**Features:**
- Smooth fade-in/out animations
- Keyboard support (ESC to close)
- Click-outside to close (configurable)
- Loading state with spinner
- Responsive design
- Proper z-index management

---

### `ConfirmationDialog`
A specialized modal for confirmation actions, especially destructive operations.

**Usage:**
```tsx
import { ConfirmationDialog, useConfirmation } from '@/components'

export function ManageUsers() {
  const confirmation = useConfirmation(async () => {
    await deleteUser(userId)
  })
  
  return (
    <>
      <button onClick={confirmation.open}>Delete User</button>
      
      <ConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={confirmation.close}
        onConfirm={confirmation.handleConfirm}
        title="Delete User?"
        message="This action cannot be undone. The user will be permanently deleted."
        confirmLabel="Delete"
        type="danger"
        isLoading={confirmation.isLoading}
      />
    </>
  )
}
```

**Props:**
- `isOpen` (boolean) - Controls dialog visibility
- `onClose` (function) - Called when dialog should close
- `onConfirm` (function) - Called when user confirms
- `title` (string) - Dialog header
- `message` (string) - Dialog body text
- `confirmLabel` (string) - Text for confirm button. Default: 'Confirm'
- `cancelLabel` (string) - Text for cancel button. Default: 'Cancel'
- `type` ('danger' | 'warning' | 'info' | 'success') - Color scheme
  - `danger`: Red (for delete/destructive actions)
  - `warning`: Orange (for cautious operations)
  - `info`: Blue (for informational)
  - `success`: Green (for confirmations)
- `isLoading` (boolean) - Disable buttons and show spinner. Default: false

**Hook: `useConfirmation`**
Manages confirmation dialog state and handles the async operation.

```tsx
const confirmation = useConfirmation(
  async () => {
    // This function runs when user confirms
    await deleteUser()
  },
  {
    onSuccess: () => console.log('Done!'),
    onError: (err) => console.error(err)
  }
)

// Available properties:
// - isOpen
// - isLoading
// - open()
// - close()
// - handleConfirm() - triggers the async function
// - reset()
```

---

## Component Patterns

### Pattern 1: Modal with Form
Combine `ModalBase` with `useFormState` hook:

```tsx
import { ModalBase } from '@/components'
import { useFormState } from '@/hooks'

export function EditUserModal({ isOpen, onClose, user }) {
  const form = useFormState(
    { name: user.name, email: user.email },
    async (values) => {
      await api.updateUser(user.id, values)
      onClose()
    }
  )
  
  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Edit User"
      isLoading={form.isSubmitting}
    >
      <form onSubmit={form.handleSubmit} className="space-y-4">
        <input
          name="name"
          value={form.values.name}
          onChange={form.handleChange}
        />
        {form.touched.name && form.errors.name && (
          <p className="text-red-500">{form.errors.name}</p>
        )}
        
        <button
          type="submit"
          disabled={form.isSubmitting}
          className={COMMON_CLASSES.BUTTON_PRIMARY}
        >
          {form.isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </ModalBase>
  )
}
```

### Pattern 2: Multi-step Confirmation
Chain multiple confirmations:

```tsx
export function DeleteWithDependents() {
  const confirm1 = useConfirmation(async () => {
    const dependents = await checkDependents()
    if (dependents.length > 0) {
      confirm2.open() // Show second confirmation
    } else {
      await deleteItem()
    }
  })
  
  const confirm2 = useConfirmation(async () => {
    await deleteWithDependents()
  })
  
  return (
    <>
      <button onClick={confirm1.open}>Delete</button>
      <ConfirmationDialog {...confirm1} type="warning" />
      <ConfirmationDialog {...confirm2} type="danger" />
    </>
  )
}
```

---

## Styling

All components use Tailwind CSS and are designed to match the application's theme.

### Customizing Colors
To change modal colors globally, update the component file. For dialog type colors:
- `danger`: bg-red-50, border-red-200, text-red-600 (button: bg-red-600)
- `warning`: bg-amber-50, border-amber-200, text-amber-600 (button: bg-amber-600)
- `info`: bg-blue-50, border-blue-200, text-blue-600 (button: bg-blue-600)
- `success`: bg-green-50, border-green-200, text-green-600 (button: bg-green-600)

---

## Accessibility

- ✅ Proper ARIA attributes
- ✅ Keyboard navigation (Tab, ESC)
- ✅ Focus management
- ✅ Semantic HTML structure
- ✅ Color contrast meets WCAG standards

---

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

---

## Examples

### Simple Alert
```tsx
<ConfirmationDialog
  isOpen={showAlert}
  onClose={handleClose}
  onConfirm={handleClose}
  title="Operation Complete"
  message="Your changes have been saved."
  confirmLabel="OK"
  type="success"
/>
```

### Loading Modal
```tsx
<ModalBase
  isOpen={true}
  onClose={() => {}}
  title="Processing..."
  isLoading={true}
  closeOnEscape={false}
  closeOnBackdropClick={false}
>
  <p>Please wait while we process your request...</p>
</ModalBase>
```

### List in Modal
```tsx
<ModalBase
  isOpen={isOpen}
  onClose={onClose}
  title="Select Item"
  size="lg"
>
  <ul className="space-y-2">
    {items.map(item => (
      <li key={item.id} className="p-2 hover:bg-gray-100 cursor-pointer">
        {item.name}
      </li>
    ))}
  </ul>
</ModalBase>
```

---

## Contributing

When adding new components:
1. Make them unstyled at the core level
2. Accept props for customization
3. Use Tailwind CSS for styling
4. Provide TypeScript types
5. Add JSDoc comments
6. Update this README
7. Include an example in the "Examples" section


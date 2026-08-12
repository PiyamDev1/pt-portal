# Shared Components

This directory contains the small, application-wide dialog primitives. Feature-specific UI stays
beside its feature under `app/`.

## `ModalBase`

`ModalBase` supplies the shared dialog shell: focus trapping and restoration, Escape handling,
backdrop dismissal, scroll locking, accessible labels, and a loading overlay.

```tsx
import { ModalBase } from '@/components'

return (
  <ModalBase isOpen={isOpen} onClose={onClose} title="Edit customer" size="md">
    <CustomerForm />
  </ModalBase>
)
```

Supported sizes are `sm`, `md`, and `lg`. Use `ariaLabel` when the dialog has no visible `title`,
and `description` for supporting text. Pass `onSubmit` when the dialog body should be wrapped in a
form.

## `ConfirmationDialog`

Use `ConfirmationDialog` for an explicit yes/no decision. Its `type` can be `danger`, `warning`,
`info`, or `success`; destructive operations should use `danger`.

```tsx
import { ConfirmationDialog } from '@/components'

return (
  <>
    <button type="button" onClick={() => setIsOpen(true)}>
      Delete
    </button>
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onConfirm={() => deleteRecord(recordId)}
      title="Delete record?"
      message="This action cannot be undone."
      confirmLabel="Delete"
      type="danger"
    />
  </>
)
```

Handle loading state and user-facing failures in the caller, normally with a Sonner toast. The
dialog prevents dismissal while `isLoading` is true.

## `useAppDialog`

`useAppDialog` is the application-native replacement for browser `confirm()` and `prompt()`.
Render its `dialog` result once and await `confirm` or `prompt` in an event handler.

```tsx
import { useAppDialog } from '@/components'

const { confirm, prompt, dialog } = useAppDialog()

const handleRename = async () => {
  const name = await prompt({
    title: 'Rename file',
    message: 'Enter a new display name.',
    label: 'Name',
  })
  if (!name) return

  const approved = await confirm({
    title: 'Save name?',
    message: `Rename the file to ${name}?`,
    confirmLabel: 'Save',
  })
  if (approved) await saveName(name)
}

return <>{dialog}</>
```

Use Sonner toasts for notifications that do not require a decision. Do not introduce native
`alert`, `confirm`, or `prompt` calls.

## Maintenance

- Export reusable additions from `components/index.ts`.
- Preserve keyboard navigation, focus behavior, button types, and accessible naming.
- Add or update a focused Testing Library test for dialog behavior.

/**
 * Shared UI Components - Barrel Export
 * New reusable components created during refactoring
 * 
 * Note: App-specific components remain in app/components/
 * (GlobalFooter, PageHeader, ProgressBarProvider, RootErrorBoundary, etc.)
 */

export { ModalBase, ModalFooter } from './ModalBase'
export type { ModalBaseProps, ModalFooterProps } from './ModalBase'

export { ConfirmationDialog, useConfirmation } from './ConfirmationDialog'
export type { ConfirmationDialogProps, ConfirmationType } from './ConfirmationDialog'

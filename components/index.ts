/**
 * Shared UI Components
 * Barrel export for easy importing
 */

export { ModalBase, ModalFooter } from './ModalBase'
export type { ModalBaseProps, ModalFooterProps } from './ModalBase'

export { ConfirmationDialog, useConfirmation } from './ConfirmationDialog'
export type { ConfirmationDialogProps, ConfirmationType } from './ConfirmationDialog'

// Re-export existing components
export { GlobalFooter } from './GlobalFooter'
export { PageHeader } from './PageHeader.client'
export { ProgressBarProvider } from './ProgressBarProvider'
export { RootErrorBoundary } from './RootErrorBoundary'
export { SessionWarningHeader } from './SessionWarningHeader'
export { WebVitalsReporter } from './WebVitalsReporter'

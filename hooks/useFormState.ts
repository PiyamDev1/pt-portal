/**
 * Generic form state management hook
 * Handles field changes, validation, and reset
 */
import { useState, useCallback } from 'react'

export interface FormErrors {
  [key: string]: string | undefined
}

export function useFormState<T extends Record<string, any>>(
  initialValues: T,
  onSubmit?: (values: T) => Promise<void> | void
) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const setFieldError = useCallback((field: string, error: string | undefined) => {
    setErrors(prev => ({
      ...prev,
      [field]: error,
    }))
  }, [])

  const setFieldTouched = useCallback((field: string, touched = true) => {
    setTouched(prev => ({
      ...prev,
      [field]: touched,
    }))
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value, type } = e.target
      const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
      setFieldValue(name as keyof T, val)
    },
    [setFieldValue]
  )

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setFieldTouched(e.target.name)
    },
    [setFieldTouched]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (onSubmit) {
        setIsSubmitting(true)
        try {
          await onSubmit(values)
        } finally {
          setIsSubmitting(false)
        }
      }
    },
    [values, onSubmit]
  )

  const resetForm = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
    setIsSubmitting(false)
  }, [initialValues])

  const resetField = useCallback((field: keyof T) => {
    setFieldValue(field, initialValues[field])
    setFieldError(String(field), undefined)
    setFieldTouched(String(field), false)
  }, [setFieldValue, setFieldError, setFieldTouched, initialValues])

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setFieldValue,
    setFieldError,
    setFieldTouched,
    handleChange,
    handleBlur,
    handleSubmit,
    resetForm,
    resetField,
  }
}

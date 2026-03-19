import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type ServiceTypeMetadata = {
  id: string
  name: string
}

type ServiceOptionMetadata = {
  id: string
  name: string
  service_type_id: string | null
}

type UseNadraServiceMetadataParams = {
  serviceTypeFilter: string
  serviceOptionFilter: string
  formServiceType: string
  formServiceOption: string
  normalizeLookupValue: (value: string | null | undefined) => string
  setServiceTypeFilter: (value: string) => void
  setServiceOptionFilter: (value: string) => void
  setFormServiceType: (value: string) => void
  setFormServiceOption: (value: string) => void
}

type UseNadraServiceMetadataResult = {
  serviceTypes: ServiceTypeMetadata[]
  serviceOptions: ServiceOptionMetadata[]
  serviceTypeNameById: Record<string, string>
  filterServiceTypeOptions: string[]
  filterServiceOptionOptions: string[]
  formServiceTypeOptions: string[]
  formServiceOptionOptions: string[]
}

export default function useNadraServiceMetadata({
  serviceTypeFilter,
  serviceOptionFilter,
  formServiceType,
  formServiceOption,
  normalizeLookupValue,
  setServiceTypeFilter,
  setServiceOptionFilter,
  setFormServiceType,
  setFormServiceOption,
}: UseNadraServiceMetadataParams): UseNadraServiceMetadataResult {
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeMetadata[]>([])
  const [serviceOptions, setServiceOptions] = useState<ServiceOptionMetadata[]>([])

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/api/nadra/metadata')
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.error || 'Unable to load service metadata')
        }

        const payload = await response.json()
        setServiceTypes(payload.serviceTypes || [])
        setServiceOptions(payload.serviceOptions || [])
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Failed to load NADRA metadata')
      }
    }

    loadMetadata()
  }, [])

  const serviceTypeNameById = useMemo(
    () =>
      serviceTypes.reduce<Record<string, string>>((acc, serviceType) => {
        acc[serviceType.id] = serviceType.name
        return acc
      }, {}),
    [serviceTypes],
  )

  const filterServiceTypeOptions = useMemo(
    () => serviceTypes.map((serviceType) => serviceType.name),
    [serviceTypes],
  )

  const currentFilterServiceTypeId = useMemo(
    () =>
      serviceTypes.find(
        (serviceType) =>
          normalizeLookupValue(serviceType.name) === normalizeLookupValue(serviceTypeFilter),
      )?.id,
    [normalizeLookupValue, serviceTypeFilter, serviceTypes],
  )

  const filterServiceOptionOptions = useMemo(
    () =>
      [
        ...new Set(
          serviceOptions
            .filter((serviceOption) => {
              if (serviceTypeFilter === 'All') return true
              return serviceOption.service_type_id === currentFilterServiceTypeId
            })
            .map((serviceOption) => serviceOption.name),
        ),
      ],
    [currentFilterServiceTypeId, serviceOptions, serviceTypeFilter],
  )

  const currentFormServiceTypeId = useMemo(
    () =>
      serviceTypes.find(
        (serviceType) =>
          normalizeLookupValue(serviceType.name) === normalizeLookupValue(formServiceType),
      )?.id,
    [formServiceType, normalizeLookupValue, serviceTypes],
  )

  const formServiceTypeOptions =
    filterServiceTypeOptions.length > 0 ? filterServiceTypeOptions : ['NICOP/CNIC']

  const formServiceOptionOptions = useMemo(
    () =>
      serviceOptions
        .filter((serviceOption) => {
          if (!currentFormServiceTypeId) return true
          return serviceOption.service_type_id === currentFormServiceTypeId
        })
        .map((serviceOption) => serviceOption.name),
    [currentFormServiceTypeId, serviceOptions],
  )

  useEffect(() => {
    if (filterServiceTypeOptions.length === 0) return
    if (serviceTypeFilter === 'All') return

    const exists = filterServiceTypeOptions.some(
      (serviceType) => normalizeLookupValue(serviceType) === normalizeLookupValue(serviceTypeFilter),
    )

    if (!exists) {
      setServiceTypeFilter('All')
    }
  }, [
    filterServiceTypeOptions,
    normalizeLookupValue,
    serviceTypeFilter,
    setServiceTypeFilter,
  ])

  useEffect(() => {
    if (filterServiceOptionOptions.length === 0) {
      if (serviceOptionFilter !== 'All') setServiceOptionFilter('All')
      return
    }

    if (serviceOptionFilter === 'All') return

    const exists = filterServiceOptionOptions.some(
      (serviceOption) =>
        normalizeLookupValue(serviceOption) === normalizeLookupValue(serviceOptionFilter),
    )

    if (!exists) {
      setServiceOptionFilter('All')
    }
  }, [
    filterServiceOptionOptions,
    normalizeLookupValue,
    serviceOptionFilter,
    setServiceOptionFilter,
  ])

  useEffect(() => {
    if (formServiceTypeOptions.length === 0) return

    const exists = formServiceTypeOptions.some(
      (serviceType) => normalizeLookupValue(serviceType) === normalizeLookupValue(formServiceType),
    )

    if (!exists) {
      setFormServiceType(formServiceTypeOptions[0])
    }
  }, [formServiceType, formServiceTypeOptions, normalizeLookupValue, setFormServiceType])

  useEffect(() => {
    if (formServiceOptionOptions.length === 0) return

    const exists = formServiceOptionOptions.some(
      (serviceOption) =>
        normalizeLookupValue(serviceOption) === normalizeLookupValue(formServiceOption),
    )

    if (!exists) {
      setFormServiceOption(formServiceOptionOptions[0])
    }
  }, [formServiceOption, formServiceOptionOptions, normalizeLookupValue, setFormServiceOption])

  return {
    serviceTypes,
    serviceOptions,
    serviceTypeNameById,
    filterServiceTypeOptions,
    filterServiceOptionOptions,
    formServiceTypeOptions,
    formServiceOptionOptions,
  }
}

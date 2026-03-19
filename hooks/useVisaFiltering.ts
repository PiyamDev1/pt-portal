import { useMemo } from 'react'
import { COMMON_NATIONALITIES } from '@/lib/visaConstants'
import type { VisaCountryOption, VisaMetadata, VisaTypeOption } from '@/app/types/visa'

interface FilteringHookProps {
  applicantNationality: string
  countryId: string
  metadata: VisaMetadata
}

export function useVisaFiltering({
  applicantNationality,
  countryId,
  metadata,
}: FilteringHookProps) {
  // 1. Get List of Nationalities (Merge Common with All Countries)
  const applicantNationalityOptions = useMemo(() => {
    const allNames = metadata?.countries?.map((country) => country.name) || []
    // Combine unique sorted list
    return Array.from(new Set([...COMMON_NATIONALITIES, ...allNames]))
  }, [metadata])

  // 2. Filter Destinations based on Selected Nationality
  const availableDestinations = useMemo<VisaCountryOption[]>(() => {
    if (!applicantNationality) return metadata?.countries || []

    // Find all Visa Types that allow this applicantNationality (or "Any")
    const validTypes = metadata?.types?.filter((type) => {
      const allowed = type.allowed_nationalities || []
      return allowed.includes('Any') || allowed.includes(applicantNationality)
    })

    // Extract unique country IDs from valid types (stringified for safe compare)
    const validCountryIds = new Set(validTypes.map((type) => String(type.country_id)))

    return metadata?.countries?.filter((country) => validCountryIds.has(String(country.id)))
  }, [applicantNationality, metadata])

  // 3. Filter Visa Types based on Destination AND Nationality
  const availableVisaTypes = useMemo<VisaTypeOption[]>(() => {
    if (!countryId) return []

    return (
      metadata?.types?.filter((type) => {
        const matchCountry = String(type.country_id) === String(countryId)
        const allowed = type.allowed_nationalities || []
        const matchNationality =
          !applicantNationality || allowed.includes('Any') || allowed.includes(applicantNationality)

        return matchCountry && matchNationality
      }) || []
    )
  }, [countryId, applicantNationality, metadata])

  return {
    applicantNationalityOptions,
    availableDestinations,
    availableVisaTypes,
  }
}

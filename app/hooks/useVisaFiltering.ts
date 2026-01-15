import { useMemo } from 'react'
import { COMMON_NATIONALITIES } from '@/app/lib/visaConstants'

interface FilteringHookProps {
  applicantNationality: string
  countryId: string
  metadata: {
    countries: any[]
    types: any[]
  }
}

export function useVisaFiltering({
  applicantNationality,
  countryId,
  metadata
}: FilteringHookProps) {
  
  // 1. Get List of Nationalities (Merge Common with All Countries)
  const applicantNationalityOptions = useMemo(() => {
    const allNames = metadata?.countries?.map((c: any) => c.name) || []
    // Combine unique sorted list
    return Array.from(new Set([...COMMON_NATIONALITIES, ...allNames]))
  }, [metadata])

  // 2. Filter Destinations based on Selected Nationality
  const availableDestinations = useMemo(() => {
    if (!applicantNationality) return metadata?.countries || []

    // Find all Visa Types that allow this applicantNationality (or "Any")
    const validTypes = metadata?.types?.filter((t: any) => {
      const allowed = t.allowed_nationalities || []
      return allowed.includes("Any") || allowed.includes(applicantNationality)
    })

    // Extract unique country IDs from valid types (stringified for safe compare)
    const validCountryIds = new Set(validTypes.map((t: any) => String(t.country_id)))

    return metadata?.countries?.filter((c: any) => validCountryIds.has(String(c.id)))
  }, [applicantNationality, metadata])

  // 3. Filter Visa Types based on Destination AND Nationality
  const availableVisaTypes = useMemo(() => {
    if (!countryId) return []

    return metadata?.types?.filter((t: any) => {
      const matchCountry = String(t.country_id) === String(countryId)
      const allowed = t.allowed_nationalities || []
      const matchNationality = !applicantNationality || allowed.includes("Any") || allowed.includes(applicantNationality)

      return matchCountry && matchNationality
    }) || []
  }, [countryId, applicantNationality, metadata])

  return {
    applicantNationalityOptions,
    availableDestinations,
    availableVisaTypes
  }
}

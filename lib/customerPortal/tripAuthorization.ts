export function effectiveCustomerTripScopes(scopes: string[], customerSubject: string | null) {
  return customerSubject ? scopes : ['read']
}

export function canStreamCustomerTripDocuments(scopes: string[], customerSubject: string | null) {
  return Boolean(customerSubject) && scopes.includes('documents')
}

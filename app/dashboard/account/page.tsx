import { redirect } from 'next/navigation'

/**
 * Keep the historic My Account URL working while using the canonical account
 * security workspace. This prevents the two security screens from drifting.
 */
export default function MyAccountPage() {
  redirect('/dashboard/settings?tab=security')
}

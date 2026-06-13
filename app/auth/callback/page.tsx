/**
 * OAuth callback entrypoint.
 *
 * The server page reads the query string and hands the code to a client-side
 * exchange component so Next can pre-render this route without a searchParams
 * suspense bailout.
 */

import AuthCallbackClient from './AuthCallbackClient'

type AuthCallbackPageProps = {
  searchParams?: Record<string, string | string[] | undefined>
}

function firstSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function resolveNextPath(value: string | null) {
  if (!value) return '/dashboard'
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export default function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const code = firstSearchParam(searchParams?.code)
  const nextPath = resolveNextPath(firstSearchParam(searchParams?.next))

  return <AuthCallbackClient code={code} nextPath={nextPath} />
}

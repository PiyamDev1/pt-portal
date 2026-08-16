/**
 * OAuth callback entrypoint.
 *
 * The server page reads the query string and hands the code to a client-side
 * exchange component so Next can pre-render this route without a searchParams
 * suspense bailout.
 */

import AuthCallbackClient from './AuthCallbackClient'

type AuthCallbackPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
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

export default async function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const resolvedSearchParams = await searchParams
  const code = firstSearchParam(resolvedSearchParams?.code)
  const nextPath = resolveNextPath(firstSearchParam(resolvedSearchParams?.next))
  const flow =
    firstSearchParam(resolvedSearchParams?.flow) === 'link-microsoft' ? 'link-microsoft' : 'sign-in'

  return <AuthCallbackClient code={code} nextPath={nextPath} flow={flow} />
}

import PackageDocumentPortalClient from './PackageDocumentPortalClient'

export const metadata = {
  title: 'Package Documents - Piyam Travel',
  description: 'View released travel package documents',
}

export default async function PackageDocumentPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return <PackageDocumentPortalClient token={token} />
}

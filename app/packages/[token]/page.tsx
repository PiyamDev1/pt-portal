import PackageShareClient from './PackageShareClient'

export const metadata = {
  title: 'Package Quote - Piyam Travel',
  description: 'Review and select a package quote option',
}

export default async function PackageSharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return <PackageShareClient token={token} />
}

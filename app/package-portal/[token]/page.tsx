import PackageDocumentPortalClient from '@/app/package-documents/[token]/PackageDocumentPortalClient'

export const metadata = {
  title: 'Your Travel Package - Piyam Travel',
  description: 'Released travel documents, vouchers, and invoices',
}

export default async function PackagePortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PackageDocumentPortalClient token={token} />
}

import ThirdPartyDocumentShareClient from './ThirdPartyDocumentShareClient'

export default async function ThirdPartyDocumentSharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ThirdPartyDocumentShareClient token={token} />
}

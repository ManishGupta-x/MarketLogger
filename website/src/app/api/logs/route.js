import { proxyREST } from '@/lib/proxy'
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') || '200'
  return proxyREST(`/api/logs?limit=${limit}`)
}

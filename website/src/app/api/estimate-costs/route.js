import { proxyREST } from '@/lib/proxy'
export async function POST(req) {
  const body = await req.json()
  return proxyREST('/api/estimate-costs', { method: 'POST', body: JSON.stringify(body) })
}

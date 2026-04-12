import { proxyREST } from '@/lib/proxy'
export async function POST(req) {
  const body = await req.json()
  return proxyREST('/api/regime/override', { method: 'POST', body: JSON.stringify(body) })
}
export async function DELETE() { return proxyREST('/api/regime/override', { method: 'DELETE' }) }

import { proxyREST } from '@/lib/proxy'
export async function GET() { return proxyREST('/api/calendar') }
export async function POST(req) {
  const body = await req.json()
  return proxyREST('/api/calendar', { method: 'POST', body: JSON.stringify(body) })
}

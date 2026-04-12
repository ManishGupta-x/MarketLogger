import { proxyREST } from '@/lib/proxy'
export async function POST() { return proxyREST('/api/risk-resume', { method: 'POST' }) }

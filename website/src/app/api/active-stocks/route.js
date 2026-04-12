import { proxyREST } from '@/lib/proxy'
export async function GET() { return proxyREST('/api/active-stocks') }

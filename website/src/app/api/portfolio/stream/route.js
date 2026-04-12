export const runtime = 'edge'
export const dynamic = 'force-dynamic'
import { proxySSE } from '@/lib/proxy'
export async function GET() { return proxySSE('/api/portfolio/stream') }

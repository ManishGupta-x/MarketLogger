/**
 * Shared proxy helpers.
 * BACKEND_URL and BACKEND_API_KEY are server-side-only env vars.
 * They are never compiled into client-side JS.
 */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:42069';
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || '';

/** Fetch a REST endpoint from the backend and return a Response. */
export async function proxyREST(path, options = {}) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${BACKEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (err) {
    console.error(`Proxy error [${path}]:`, err.message);
    return Response.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}

/** Stream SSE from backend to client — zero-copy pipe. */
export async function proxySSE(path) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      headers: {
        'Authorization': `Bearer ${BACKEND_API_KEY}`,
        'Accept': 'text/event-stream'
      }
    });
    return new Response(res.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }
    });
  } catch (err) {
    console.error(`SSE proxy error [${path}]:`, err.message);
    return new Response(`event: error\ndata: {"error":"Backend unreachable"}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const KEY_STORAGE = "market_api_key";

export function getApiKey() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY_STORAGE);
}

export function setApiKey(key) {
  window.localStorage.setItem(KEY_STORAGE, key);
}

export function clearApiKey() {
  window.localStorage.removeItem(KEY_STORAGE);
}

async function request(path, options = {}) {
  const key = getApiKey();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(key ? { "X-API-Key": key } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && typeof window !== "undefined") {
    // Backend requires an API key we don't have (or ours is wrong) — let the
    // ApiKeyGate take over and prompt for it.
    window.dispatchEvent(new Event("api-unauthorized"));
  }

  if (res.status === 204) return null;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (data && data.error) || `Request failed: ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  del: (path) => request(path, { method: "DELETE" }),
};

export { API_URL };

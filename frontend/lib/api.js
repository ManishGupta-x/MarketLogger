const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: options.body instanceof FormData
      ? options.headers
      : { "Content-Type": "application/json", ...options.headers },
  });

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

// The single place the client talks to /api.
//
// Everything goes through here so that Phase 2 can attach the session cookie
// and handle 401s in one spot instead of at every call site.

/** Thrown for any non-2xx response. `status` is the HTTP status. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Pulls the server's { error } message out of a failed response without
// assuming the body is JSON — an outage can return HTML.
async function errorMessage(res) {
  try {
    const data = await res.json();
    if (data && data.error) return data.error;
  } catch {
    // not JSON
  }
  return `Request failed (${res.status})`;
}

/** POST JSON, get JSON back. */
export async function postJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json();
}

/** POST a raw binary body (a recording), get JSON back. */
export async function postBlobForJson(path, blob, contentType) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": contentType || blob.type || "application/octet-stream" },
    credentials: "same-origin",
    body: blob,
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json();
}

/** POST JSON, get a binary body back (synthesised speech). */
export async function postJsonForBlob(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.blob();
}

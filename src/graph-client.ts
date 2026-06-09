import { GraphApiError, type GraphErrorPayload } from "./types.js";

// Lazy env access — index.ts loads .env.local at startup, but ES module imports
// are hoisted, so reading process.env at module top would fire BEFORE dotenv.
function token(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) {
    throw new Error(
      "[meta-ads-mcp] META_SYSTEM_USER_TOKEN missing. Copy .env.example to .env.local and fill it in.",
    );
  }
  return t;
}
function baseUrl(): string {
  return `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION ?? "v24.0"}`;
}

export function resolveAccountId(input?: string): string {
  const raw = (input ?? process.env.META_DEFAULT_ACCOUNT_ID ?? "").trim();
  if (!raw) {
    throw new Error(
      "account_id is required (or set META_DEFAULT_ACCOUNT_ID in .env.local).",
    );
  }
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

export function fieldsParam(fields?: string[] | string): string | undefined {
  if (!fields) return undefined;
  return Array.isArray(fields) ? fields.join(",") : fields;
}

async function unwrap<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new GraphApiError(
      `Non-JSON response (${res.status}): ${text.slice(0, 200)}`,
      res.status,
      "HttpError",
    );
  }

  if (!res.ok || (json as GraphErrorPayload)?.error) {
    const err = (json as GraphErrorPayload)?.error;
    if (err) {
      throw new GraphApiError(
        err.message,
        err.code,
        err.type,
        err.fbtrace_id,
        err.error_subcode,
        err.error_user_title,
        err.error_user_msg,
      );
    }
    throw new GraphApiError(
      `HTTP ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      "HttpError",
    );
  }

  return json as T;
}

// Retry transient errors (rate limit / 5xx) with exponential backoff.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!(e instanceof GraphApiError)) throw e;
      const transient =
        e.code === 4 || // App rate limit
        e.code === 17 || // User rate limit
        e.code === 32 || // Page-level rate limit
        e.code === 613 || // Custom-level rate limit
        e.code >= 500;
      if (!transient || attempt === maxAttempts) throw e;
      const wait = Math.min(2000 * 2 ** (attempt - 1), 10_000);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export async function graphGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${baseUrl()}/${path.replace(/^\//, "")}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  url.searchParams.set("access_token", token());

  return withRetry(async () => {
    const res = await fetch(url.toString(), { method: "GET" });
    return unwrap<T>(res);
  });
}

export async function graphDelete<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${baseUrl()}/${path.replace(/^\//, "")}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  url.searchParams.set("access_token", token());

  return withRetry(async () => {
    const res = await fetch(url.toString(), { method: "DELETE" });
    return unwrap<T>(res);
  });
}

export async function graphPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${baseUrl()}/${path.replace(/^\//, "")}`;
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    form.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  form.set("access_token", token());

  return withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    return unwrap<T>(res);
  });
}

export async function graphPostMultipart<T>(
  path: string,
  fields: Record<string, string>,
  files: Record<string, { filename: string; data: Buffer; contentType?: string }>,
): Promise<T> {
  const url = `${baseUrl()}/${path.replace(/^\//, "")}`;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  for (const [k, file] of Object.entries(files)) {
    const blob = new Blob([new Uint8Array(file.data)], {
      type: file.contentType ?? "application/octet-stream",
    });
    form.append(k, blob, file.filename);
  }
  form.append("access_token", token());

  return withRetry(async () => {
    const res = await fetch(url, { method: "POST", body: form });
    return unwrap<T>(res);
  });
}

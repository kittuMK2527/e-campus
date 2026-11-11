/**
 * Unified Anti-Cache & CSRF Protected API Fetch Utility
 * 
 * Guarantees that all client-side API requests:
 * 1. Bypass browser disk and memory HTTP caching (no 304 Not Modified delays).
 * 2. Append a millisecond timestamp cache-buster (_t=Date.now()) on GET requests.
 * 3. Enforce "cache: no-store" and "Pragma: no-cache" headers.
 *    (1-3 do not apply to GETs listed in SERVER_CACHED_GETS, which negotiate freshness server-side.)
 * 4. Automatically attaches the CSRF token (`x-csrf-token`) on state-changing requests (POST, PUT, DELETE, PATCH).
 * 5. Handles JSON serialization and safe response parsing.
 * 6. Intercepts global fetch() so all legacy and newly created components benefit from automatic CSRF and anti-cache protection.
 */

let memoryCsrfToken: string | null = null;

/**
 * GETs whose route handler already negotiates freshness itself (ETag + max-age),
 * which the blanket `_t` buster and forced `no-store` below would defeat.
 * Adding a path here opts it into normal HTTP caching, so cap it at endpoints
 * that are safe to serve up to their max-age window.
 */
const SERVER_CACHED_GETS = ["/api/data/reference"];

function isServerCachedGet(url: string): boolean {
  return SERVER_CACHED_GETS.some((path) => url.includes(path));
}

export function setClientCsrfToken(token: string | null) {
  memoryCsrfToken = token;
  if (typeof window !== "undefined" && token) {
    (window as any).__ecampus_csrf = token;
  }
}

export function getClientCsrfToken(): string | null {
  if (memoryCsrfToken) return memoryCsrfToken;
  if (typeof window !== "undefined") {
    if ((window as any).__ecampus_csrf) {
      return (window as any).__ecampus_csrf;
    }
    // Read from ecampus_csrf cookie
    const match = document.cookie.match(/(^|;\s*)ecampus_csrf=([^;]+)/);
    if (match && match[2]) {
      return decodeURIComponent(match[2]);
    }
  }
  return null;
}

const NETWORK_RETRY_DELAY_MS = 400;

/**
 * A backgrounded tab or a just-restarted dev server drops an in-flight fetch as a
 * TypeError before any HTTP status exists. One short retry recovers the first GET
 * after a wake-up instead of showing the stale-data banner; mutations are never
 * retried because a duplicate write is worse than a visible error.
 */
async function fetchWithNetworkRetry(doFetch: () => Promise<Response>): Promise<Response> {
  try {
    return await doFetch();
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw err;
    await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
    return doFetch();
  }
}

/**
 * Transparent fetch interceptor that automatically attaches CSRF tokens,
 * anti-cache headers, and catches 401 session expirations across all components.
 */
export function installFetchInterceptor() {
  if (typeof window === "undefined") return;
  if ((window as any).__ecampus_fetch_intercepted) return;
  (window as any).__ecampus_fetch_intercepted = true;

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || "GET").toUpperCase();
    const isMutation = method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
    const serverCached = method === "GET" && isServerCachedGet(url);

    // Only intercept internal /api/ calls
    const isApiCall =
      url.startsWith("/api/") ||
      (typeof window !== "undefined" && url.startsWith(window.location.origin + "/api/"));

    if (isApiCall) {
      const headers = new Headers(init?.headers || {});

      // Add CSRF token for mutations if not already present
      if (isMutation && !headers.has("x-csrf-token")) {
        const csrfToken = getClientCsrfToken();
        if (csrfToken) {
          headers.set("x-csrf-token", csrfToken);
        }
      }

      // Add anti-cache headers
      if (!serverCached) {
        if (!headers.has("Pragma")) headers.set("Pragma", "no-cache");
        if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      }

      init = {
        ...init,
        headers,
        cache: init?.cache || (serverCached ? "default" : "no-store")
      };
    }

    const doFetch = () => originalFetch(input, init);
    const res = (isApiCall && method === "GET")
      ? await fetchWithNetworkRetry(doFetch)
      : await doFetch();

    // Global session expiry interception: if 401 with SESSION_IDLE, SESSION_EXPIRED, or NO_SESSION
    if (res.status === 401 && isApiCall && !url.includes("/api/login") && !url.includes("/api/auth/me")) {
      try {
        const cloned = res.clone();
        const json = await cloned.json().catch(() => null);
        if (json?.code === "SESSION_IDLE" || json?.code === "SESSION_EXPIRED" || json?.code === "NO_SESSION") {
          window.dispatchEvent(new CustomEvent("ecampus_session_expired", { detail: json }));
        }
      } catch (_) {}
    }

    if (res.status === 403 && isApiCall) {
      const json = await res.clone().json().catch(() => null);
      if (json?.code === "PASSWORD_CHANGE_REQUIRED") {
        window.dispatchEvent(new CustomEvent("ecampus_password_change_required"));
      }
    }

    return res;
  };
}

if (typeof window !== "undefined") {
  installFetchInterceptor();
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** Request body (can be string, FormData, Blob, or plain JS object) */
  body?: any;
  /** Skip appending timestamp query param (defaults to false for GET) */
  skipCacheBuster?: boolean;
}

export async function apiFetch<T = any>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { skipCacheBuster = false, headers = {}, ...fetchOptions } = options;
  const method = (options.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const isMutation = method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
  const serverCached = isGet && isServerCachedGet(url);

  let finalUrl = url;

  if (isGet && !skipCacheBuster && !serverCached) {
    if (typeof window !== "undefined") {
      const isAbsolute = url.startsWith("http://") || url.startsWith("https://");
      const urlObj = isAbsolute
        ? new URL(url)
        : new URL(url, window.location.origin);

      urlObj.searchParams.set("_t", Date.now().toString());
      finalUrl = isAbsolute ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;
    } else {
      const sep = url.includes("?") ? "&" : "?";
      finalUrl = `${url}${sep}_t=${Date.now()}`;
    }
  }

  const defaultHeaders: Record<string, string> = serverCached
    ? {}
    : {
        "Pragma": "no-cache",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      };

  // Attach CSRF token on mutating requests if not explicitly provided
  if (isMutation) {
    const csrfToken = getClientCsrfToken();
    if (csrfToken && !(headers as Record<string, string>)["x-csrf-token"]) {
      defaultHeaders["x-csrf-token"] = csrfToken;
    }
  }

  // If body is a plain JS object (not FormData/Blob/string), stringify it and set JSON content type
  if (
    options.body &&
    typeof options.body === "object" &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof ArrayBuffer) &&
    !(options.body instanceof URLSearchParams)
  ) {
    defaultHeaders["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(options.body);
  }

  const doFetch = () => fetch(finalUrl, {
    ...fetchOptions,
    method,
    cache: fetchOptions.cache ?? (serverCached ? "default" : "no-store"),
    headers: {
      ...defaultHeaders,
      ...(headers as Record<string, string>)
    }
  });
  const res = isGet ? await fetchWithNetworkRetry(doFetch) : await doFetch();

  const contentType = res.headers.get("content-type") || "";
  let data: any;

  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else {
    data = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const errorMsg = data?.message || data?.error || `Request failed with status ${res.status}`;
    const err = new Error(errorMsg);
    (err as any).status = res.status;
    (err as any).data = data;
    (err as any).code = data?.code;
    throw err;
  }

  return data as T;
}

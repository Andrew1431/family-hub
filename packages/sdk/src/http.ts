/**
 * Most route handlers just return a value that the core serializes as JSON.
 * A few need to control the raw HTTP response — e.g. an OAuth callback that
 * returns an HTML page, or a redirect. Returning a `RawResponse` from a handler
 * tells the core to send it verbatim instead of JSON-encoding it.
 */
export interface RawResponse {
  readonly __raw: true;
  status: number;
  headers?: Record<string, string>;
  body: string;
}

/** An HTML page response (defaults to 200). */
export function html(body: string, status = 200): RawResponse {
  return {
    __raw: true,
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
    body,
  };
}

/** A 302 redirect to `location`. */
export function redirect(location: string, status = 302): RawResponse {
  return { __raw: true, status, headers: { location }, body: "" };
}

/** Type guard the core uses to detect a raw response from a handler return. */
export function isRawResponse(value: unknown): value is RawResponse {
  return typeof value === "object" && value !== null && (value as RawResponse).__raw === true;
}

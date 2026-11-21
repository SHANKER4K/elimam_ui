/**
 * Pulls a human-readable message out of any error shape the search relay
 * or the FastAPI backend can produce:
 * - FastAPI HTTPException forwarded by the relay: { error: "FastAPI 502", details: { detail: "..." } }
 * - plain relay errors: { error: "..." } / { message: "..." }
 * - legacy backend 200s that carried [{ error: "..." }] arrays
 */
export function extractSearchError(data: unknown, status: number): string {
  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === "object" && "error" in first) {
      const msg = (first as { error: unknown }).error;
      if (typeof msg === "string" && msg) return msg;
    }
    return `HTTP ${status}`;
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const details = obj.details;
    if (details !== null && typeof details === "object" && "detail" in details) {
      const msg = (details as { detail: unknown }).detail;
      if (typeof msg === "string" && msg) return msg;
    }
    for (const key of ["details", "error", "message", "detail"]) {
      const value = obj[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return `HTTP ${status}`;
}

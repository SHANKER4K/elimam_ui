import { expect, test } from "bun:test";
import { extractSearchError } from "./search-error";

test("extractSearchError reads FastAPI detail forwarded by the relay", () => {
  expect(
    extractSearchError({ error: "FastAPI 502", details: { detail: "ConnectError: TEI down" } }, 502),
  ).toBe("ConnectError: TEI down");
});

test("extractSearchError falls back to relay error then details string then status", () => {
  expect(extractSearchError({ error: "FastAPI 400", details: "top_k > 100" }, 400)).toBe(
    "top_k > 100",
  );
  expect(extractSearchError({ error: "API_URL is not configured" }, 500)).toBe(
    "API_URL is not configured",
  );
  expect(extractSearchError({ message: "Unauthorized" }, 401)).toBe("Unauthorized");
  expect(extractSearchError(null, 502)).toBe("HTTP 502");
});

test("extractSearchError handles legacy [{error}] array payloads", () => {
  expect(extractSearchError([{ error: "ConnectError: timeout" }], 200)).toBe(
    "ConnectError: timeout",
  );
  expect(extractSearchError([], 200)).toBe("HTTP 200");
});

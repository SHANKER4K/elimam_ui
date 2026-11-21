import { expect, test } from "bun:test";
import { parseEvent } from "./sse";

test("parseEvent joins multi-line data frames with \\n (SSE spec)", () => {
  // One JSON object split across two data: lines — joining with \n keeps it valid.
  const [name, data] = parseEvent(
    'event: text_delta\ndata: {"text":\ndata: "hello"}',
  );
  expect(name).toBe("text_delta");
  expect(data).toEqual({ text: "hello" });
});

test("parseEvent strips exactly one leading space after data:, preserving the rest", () => {
  // SSE spec: a single optional space after the colon is removed, nothing more.
  const [, data] = parseEvent('data: {"text": "  spaced  "}');
  expect(data).toEqual({ text: "  spaced  " });
});

test("parseEvent reads the event name and defaults empty data to {}", () => {
  expect(parseEvent("event: message_start")).toEqual(["message_start", {}]);
});

test("parseEvent tolerates blank/comment lines", () => {
  const [name, data] = parseEvent(': keep-alive comment\nevent: tool\ndata:{"text":"search"}');
  expect(name).toBe("tool");
  expect(data).toEqual({ text: "search" });
});

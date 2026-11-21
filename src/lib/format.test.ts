import { expect, test } from "bun:test";
import { formatToolDuration } from "./format";

test("formatToolDuration shows milliseconds under 1s and seconds after", () => {
  expect(formatToolDuration(812)).toBe("٨١٢ ملّي ثانية");
  expect(formatToolDuration(1420)).toBe("١٫٤ ثانية");
  expect(formatToolDuration(null)).toBeNull();
});

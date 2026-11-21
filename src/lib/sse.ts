/**
 * Minimal SSE frame parser per the WHATWG spec: multiple `data:` lines are
 * joined with \n, a single optional space after `data:` is stripped (nothing
 * more, so whitespace-only text_delta tokens survive), and `:` comments and
 * blank lines are ignored.
 */
export function parseEvent(raw: string): [string, unknown] {
  let eventName = "";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) {
      data += (data ? "\n" : "") + line.slice(5).replace(/^ /, "");
    } else if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    }
  }
  const json = data ? JSON.parse(data) : {};
  return [eventName, json];
}

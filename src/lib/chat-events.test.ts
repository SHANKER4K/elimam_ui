import { expect, test } from "bun:test";
import { HttpAgent } from "@ag-ui/client";
import { applyEvent, settleAborted, type ChatMessage } from "./chat-events";

const sse = (evs: object[]) => evs.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

// Runs a canned AG-UI stream through the real HttpAgent (parser + verifier)
// and folds every event with applyEvent, as chat.tsx does.
async function run(events: object[]): Promise<ChatMessage[]> {
  let msgs: ChatMessage[] = [];
  const fetch = (async () =>
    new Response(sse(events), { headers: { "Content-Type": "text/event-stream" } })) as never;
  await new HttpAgent({ url: "/api/chat", threadId: "t", fetch }).runAgent(
    { runId: "r" },
    { onEvent: ({ event }) => { msgs = applyEvent(msgs, event, 0); } },
  );
  return msgs;
}

test("AG-UI stream maps onto thinking, tool trace and text", async () => {
  const msgs = await run([
    { type: "RUN_STARTED", threadId: "t", runId: "r" },
    { type: "REASONING_START", messageId: "r1" },
    { type: "REASONING_MESSAGE_START", messageId: "r1", role: "reasoning" },
    { type: "REASONING_MESSAGE_CONTENT", messageId: "r1", delta: "أفكر " },
    { type: "REASONING_MESSAGE_CONTENT", messageId: "r1", delta: "في السؤال" },
    { type: "REASONING_MESSAGE_END", messageId: "r1" },
    { type: "REASONING_END", messageId: "r1" },
    { type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "search_quran", metadata: { title: "بحث في القرآن", icon: "book" } },
    { type: "TOOL_CALL_ARGS", toolCallId: "c1", delta: '{"q":"الصبر"}' },
    { type: "TOOL_CALL_END", toolCallId: "c1" },
    { type: "TOOL_CALL_RESULT", messageId: "tr1", toolCallId: "c1", content: "[]", metadata: { status: "ok", count: 3, duration_ms: 120, summary: "3 آيات" } },
    { type: "TOOL_CALL_START", toolCallId: "c2", toolCallName: "search_hadith" },
    { type: "TOOL_CALL_END", toolCallId: "c2" },
    { type: "TOOL_CALL_RESULT", messageId: "tr2", toolCallId: "c2", content: "[]" },
    { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: " " }, // whitespace-only delta survives
    { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "قال تعالى" },
    { type: "TEXT_MESSAGE_END", messageId: "m1" },
    { type: "RUN_FINISHED", threadId: "t", runId: "r" },
  ]);
  expect(msgs).toEqual([
    { type: "thinking", role: "assistant", id: "r1", content: "أفكر في السؤال", status: "done", startedAt: 0, durationMs: 0 },
    { type: "tool", role: "assistant", callId: "c1", title: "بحث في القرآن", subtitle: undefined, icon: "book", status: "ok", summary: "3 آيات", count: 3, durationMs: 120, errorMessage: undefined, preview: undefined },
    // No metadata: degrades to the tool name and "ok".
    { type: "tool", role: "assistant", callId: "c2", title: "search_hadith", subtitle: undefined, icon: undefined, status: "ok", summary: undefined, count: null, durationMs: null, errorMessage: undefined, preview: undefined },
    { type: "message", role: "assistant", id: "m1", content: " قال تعالى" },
  ]);
});

test("RUN_ERROR surfaces as an assistant error message", async () => {
  const msgs = await run([
    { type: "RUN_STARTED", threadId: "t", runId: "r" },
    { type: "RUN_ERROR", message: "model overloaded" },
  ]);
  expect(msgs.at(-1)).toEqual({ type: "message", role: "assistant", content: "حدث خطأ: model overloaded" });
});

test("settleAborted closes running tools and streaming thinking", () => {
  const out = settleAborted(
    [
      { type: "tool", role: "assistant", callId: "c", title: "x", status: "running" },
      { type: "thinking", role: "assistant", id: "r", content: "", status: "streaming", startedAt: 10 },
    ],
    25,
  );
  expect(out.map((m) => m.status)).toEqual(["error", "done"]);
  expect(out[1]).toMatchObject({ durationMs: 15 });
});

import { EventType, type BaseEvent } from "@ag-ui/core";

export type ChatMessage =
  | {
      type: "tool";
      role: "assistant";
      callId: string;
      title: string;
      subtitle?: string;
      icon?: string;
      status: "running" | "ok" | "empty" | "error";
      summary?: string;
      count?: number | null;
      durationMs?: number | null;
      errorMessage?: string;
      preview?: Array<{ ids?: string; text: string }>;
    }
  | {
      type: "thinking";
      role: "assistant";
      id: string;
      content: string;
      status: "streaming" | "done";
      startedAt: number;
      durationMs?: number;
    }
  | { type: "message"; role: "user" | "assistant"; id?: string; content: string };

export const errorMessage = (detail?: string): ChatMessage => ({
  type: "message",
  role: "assistant",
  content: detail ? `حدث خطأ: ${detail}` : "حدث خطأ في الاتصال. حاول مرة أخرى.",
});

/**
 * Fold one AG-UI event into the chat transcript. Pure, so the whole stream
 * mapping is testable without a network.
 *
 * Tool-card extras (title, subtitle, icon, status, summary, count,
 * duration_ms, preview, message) are read from the event's open `metadata`
 * bag, snake_case as the backend sent them before AG-UI. Without them a card
 * degrades to the tool name + "ok".
 */
// ponytail: AG-UI event payloads are read by a handful of known keys; `any`
// avoids a discriminated-union cast per case for no runtime gain.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyEvent(prev: ChatMessage[], e: any, now: number): ChatMessage[] {
  const md = e.metadata ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (match: (m: ChatMessage) => boolean, f: (m: any) => ChatMessage) =>
    prev.map((m) => (match(m) ? f(m) : m));
  const byId = (type: string) => (m: ChatMessage) =>
    m.type === type && "id" in m && m.id === e.messageId;

  switch ((e as BaseEvent).type) {
    case EventType.TEXT_MESSAGE_START:
      return [...prev, { type: "message", role: "assistant", id: e.messageId, content: "" }];
    case EventType.TEXT_MESSAGE_CONTENT:
      return update(byId("message"), (m) => ({ ...m, content: m.content + e.delta }));
    case EventType.TOOL_CALL_START:
      return [
        ...prev,
        {
          type: "tool",
          role: "assistant",
          callId: e.toolCallId,
          title: md.title ?? e.toolCallName,
          subtitle: md.subtitle,
          icon: md.icon,
          status: "running",
        },
      ];
    case EventType.TOOL_CALL_RESULT:
      return update(
        (m) => m.type === "tool" && m.callId === e.toolCallId,
        (m) => ({
          ...m,
          status: md.status ?? "ok",
          summary: md.summary,
          count: md.count ?? null,
          durationMs: md.duration_ms ?? null,
          errorMessage: md.message,
          preview: md.preview,
        }),
      );
    case EventType.REASONING_MESSAGE_START:
      return [
        ...prev,
        { type: "thinking", role: "assistant", id: e.messageId, content: "", status: "streaming", startedAt: now },
      ];
    case EventType.REASONING_MESSAGE_CONTENT:
      return update(byId("thinking"), (m) => ({ ...m, content: m.content + e.delta }));
    case EventType.REASONING_MESSAGE_END:
      return update(byId("thinking"), (m) => ({ ...m, status: "done", durationMs: now - m.startedAt }));
    case EventType.RUN_ERROR:
      return [...prev, errorMessage(e.message)];
    default:
      return prev;
  }
}

/** After a user stop, close anything left mid-stream so nothing looks stuck. */
export function settleAborted(prev: ChatMessage[], now: number): ChatMessage[] {
  return prev.map((m) =>
    m.type === "thinking" && m.status === "streaming"
      ? { ...m, status: "done", durationMs: now - m.startedAt }
      : m.type === "tool" && m.status === "running"
        ? { ...m, status: "error", errorMessage: "أُلغي التوليد" }
        : m,
  );
}

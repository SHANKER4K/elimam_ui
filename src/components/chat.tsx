"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatStatus } from "ai";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuth, useSession } from "@better-auth-ui/react";
import type { AppAuthClient } from "@/lib/auth-client";
import { fetchHistory } from "@/lib/chat-history";
import { parseEvent } from "@/lib/sse";
import { listMyProviders, type MyProviders } from "@/lib/providers";
import { ApiKeyGate } from "@/components/api-key-gate";

import {
  PromptInputProvider,
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "@/components/ai-elements/chain-of-thought";
import { ChatContainerScrollAnchor } from "@/components/ui/chat-container";
import { Tool } from "@/components/ui/tool";
import { CopyButton } from "@/components/copy-button";
import { formatToolDuration } from "@/lib/format";
import { citationsToPlainText } from "@/lib/citation";
import { cn } from "@/lib/utils";

export type ChatModel = {
  chef: string;
  chefSlug: string;
  id: string;
  name: string;
  providers: string[];
  variants: string[];
};

type ChatMessage =
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
      index: number;
      id?: string;
      content: string;
      status: "streaming" | "done";
      startedAt: number;
      durationMs?: number;
    }
  | { type: "message"; role: "user" | "assistant"; content: string };

const suggestedPrompts = [
  "ما حكم صيام الست من شوال؟",
  "آيات عن الصبر",
  "أحاديث عن بر الوالدين",
  "ما هي ليلة القدر؟",
];

const VARIANT_LABELS: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
};
const variantLabel = (v: string) => VARIANT_LABELS[v] ?? v;

type ThinkingItem = Extract<ChatMessage, { type: "thinking" }>;

function ThinkingBlock({ msg }: { msg: ThinkingItem }) {
  const streaming = msg.status === "streaming";
  const duration = formatToolDuration(msg.durationMs);
  return (
    <ChainOfThought defaultOpen={streaming} className="my-1">
      <ChainOfThoughtHeader>
        {streaming
          ? "جارٍ التفكير..."
          : duration
            ? `فكّر لمدة ${duration}`
            : "تفكير"}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <p
          dir="rtl"
          className="text-sm leading-7 text-muted-foreground whitespace-pre-wrap"
        >
          {msg.content}
        </p>
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

export default function HomePage({
  models,
  sessionId,
}: {
  models: ChatModel[];
  sessionId?: string;
}) {
  return (
    <PromptInputProvider>
      <Chat models={models} sessionId={sessionId} />
    </PromptInputProvider>
  );
}

function Chat({
  models,
  sessionId,
}: {
  models: ChatModel[];
  sessionId?: string;
}) {
  const controller = usePromptInputController();
  const router = useRouter();
  const { authClient } = useAuth<AppAuthClient>();
  const { data: session } = useSession(authClient);
  const userId = session?.user?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [modelId, setModelId] = useState<string>(models[0]?.id ?? "");
  const [variant, setVariant] = useState<string>(
    models[0]?.variants[0] ?? "low",
  );
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // ponytail: URL is the source of truth (option A, ChatGPT-style). The
  // ref mirrors it; on `/` the ref is empty until first submit, on `/[uuid]`
  // it starts with the URL value. New conversation = router.push("/").
  const sessionIdRef = useRef<string | null>(sessionId ?? null);
  const pendingTextRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [myProviders, setMyProviders] = useState<MyProviders | null>(null);
  const [gate, setGate] = useState<{
    open: boolean;
    connectionId: string;
    providerName: string;
    docsUrl: string | null;
  }>({ open: false, connectionId: "", providerName: "", docsUrl: null });

  // Hydrate message history when landing directly on /[uuid].
  // ponytail: external-system sync (FastAPI history fetch).
  useEffect(() => {
    if (!sessionId) return;


    fetchHistory(sessionId)
      .then((rows) => {
        const hydrated: ChatMessage[] = rows
          .filter((r) => r.content !== null && r.role !== "system")
          .map((r) => ({
            type: "message" as const,
            role: r.role as "user" | "assistant",
            content: r.content ?? "",
          }));
        setMessages(hydrated);
      })
      .catch(() => {});
  }, [sessionId]);

  const selectedModel = models.find((m) => m.id === modelId) ?? models[0];

  const chefs = [...new Set(models.map((m) => m.chef))];

  const selectedChef = selectedModel?.chef ?? "";

  // The caller's own connections, from the DB-backed `/me/providers` API. The
  // selected model always belongs to one of them, so its key state is known
  // synchronously once the list has loaded (no per-model `exists` probe).
  useEffect(() => {
    if (!userId) return;
    listMyProviders()
      .then(setMyProviders)
      .catch(() => setMyProviders(null));
  }, [userId]);

  const selectedConnection = myProviders?.connections.find(
    (c) => (c.slug ?? c.name) === selectedChef,
  );
  const keyStatus: "ok" | "missing" = !selectedConnection
    ? "ok"
    : selectedConnection.requiresKey && !selectedConnection.hasKey
      ? "missing"
      : "ok";

  const handleModelSelect = useCallback(
    (id: string) => {
      setModelId(id);
      const m = models.find((x) => x.id === id);
      setVariant(m?.variants[0] ?? "low");
      setModelSelectorOpen(false);
    },
    [models],
  );

  // URL-only navigation: no RSC round-trip, no remount, state survives.
  function navigateToSession(id: string) {
    window.history.pushState(null, "", `/${id}`);
  }

  // ponytail: extracted so handleSubmit can re-fire it after the user
  // adds a key in the gate modal. Body is built fresh per call.
  async function runStream(text: string) {
    if (!userId) {
      setStatus("error");
      return;
    }
    // Lazy-create the session id on first send from `/`.
    if (!sessionIdRef.current) {
      sessionIdRef.current = crypto.randomUUID();
      navigateToSession(sessionIdRef.current); // was router.push(...)
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          session_id: sessionIdRef.current,
          model_provider: selectedModel?.chef ?? "",
          model_name: selectedModel?.id ?? "",
          model_variant: variant,
          // Pins the session to the connection that will pay for it. Builtin
          // providers also resolve by slug; a custom connection has no slug,
          // so this is the only way the backend can find it.
          user_provider_id: selectedConnection?.id ?? null,
          web: true,
        }),
      });
      if (!res.ok) {
        // The relay forwards the backend's status + JSON error body.
        let detail = "";
        try {
          const err = await res.json();
          detail = [err.detail, err.message, err.error].find(
            (v) => typeof v === "string" && v,
          );
        } catch {}
        throw new Error(detail || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // ponytail: SSE event payloads have a dynamic shape; we only ever read
      // a few known keys off `data`, so `any` is honest here. Tightening to
      // `unknown` would force pointless narrowing at every read site.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const process = (data: any, eventName: string) => {
        if (eventName === "error") {
          throw new Error(
            data.detail ?? data.message ?? "حدث خطأ أثناء التوليد",
          );
        } else if (eventName === "tool") {
          setStatus("streaming");
          setMessages((prev) => [
            ...prev,
            {
              type: "tool",
              role: "assistant",
              callId: data.tool_call_id ?? "",
              title: data.title ?? data.tool_name ?? data.text,
              subtitle: data.subtitle,
              icon: data.icon,
              status: data.status ?? "running",
            },
          ]);
        } else if (eventName === "tool_result") {
          setMessages((prev) =>
            prev.map((m: ChatMessage) =>
              "callId" in m && m.callId === data.tool_call_id
                ? {
                    ...m,
                    status: data.status ?? "ok",
                    summary: data.summary,
                    count: data.count ?? null,
                    durationMs: data.duration_ms ?? data.durationMs ?? null,
                    errorMessage: data.message,
                    preview: data.preview,
                  }
                : m,
            ),
          );
        } else if (eventName === "thinking_start") {
          setStatus("streaming");
          setMessages((prev) => [
            ...prev,
            {
              type: "thinking",
              role: "assistant",
              index: data.index ?? 0,
              id: data.id,
              content: "",
              status: "streaming",
              startedAt: performance.now(),
            },
          ]);
        } else if (eventName === "thinking_delta") {
          setMessages((prev) => {
            const idx = data.index ?? 0;
            const next = prev.some(
              (m) => m.type === "thinking" && m.index === idx,
            )
              ? prev
              : [
                  // Provider emitted a delta without thinking_start.
                  ...prev,
                  {
                    type: "thinking" as const,
                    role: "assistant" as const,
                    index: idx,
                    id: data.id,
                    content: "",
                    status: "streaming" as const,
                    startedAt: performance.now(),
                  },
                ];
            return next.map((m: ChatMessage) =>
              m.type === "thinking" && m.index === idx
                ? { ...m, content: m.content + (data.text ?? "") }
                : m,
            );
          });
        } else if (eventName === "thinking_end") {
          setMessages((prev) =>
            prev.map((m: ChatMessage) =>
              m.type === "thinking" && m.index === (data.index ?? 0)
                ? {
                    ...m,
                    status: "done",
                    durationMs: performance.now() - m.startedAt,
                  }
                : m,
            ),
          );
        } else if (eventName === "thinking") {
          // Fallback whole-part event for non-streaming thinking providers:
          // only add a completed block if nothing streamed for this id.
          setMessages((prev) =>
            prev.some((m) => m.type === "thinking" && m.id === data.id)
              ? prev
              : [
                  ...prev,
                  {
                    type: "thinking",
                    role: "assistant",
                    index: data.index ?? 0,
                    id: data.id,
                    content: data.text ?? "",
                    status: "done",
                    startedAt: performance.now(),
                  },
                ],
          );
        } else if (eventName === "message_start") {
          setStatus("streaming");
          setMessages((prev) => [
            ...prev,
            { type: "message", role: "assistant", content: data.text ?? "" },
          ]);
        } else if (eventName === "text_delta") {
          setStatus("streaming");
          setMessages((prev) => {
            // Append to the latest assistant message of this turn even if
            // tool/thinking items were pushed after it mid-turn — never
            // cross back over a user message into a previous turn.
            for (let i = prev.length - 1; i >= 0; i--) {
              const m = prev[i];
              if (m.type === "message" && m.role === "assistant") {
                return [
                  ...prev.slice(0, i),
                  { ...m, content: m.content + (data.text ?? "") },
                  ...prev.slice(i + 1),
                ];
              }
              if (m.type === "message" && m.role === "user") break;
            }
            // No assistant text yet in this turn: start one implicitly.
            return [
              ...prev,
              { type: "message", role: "assistant", content: data.text ?? "" },
            ];
          });
        }
      };

      const handle = (raw: string) => {
        const [eventName, data] = parseEvent(raw);
        // ponytail: see the `any` note above
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        process(data as any, eventName);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          handle(raw);
        }
      }
      // Flush a final frame not terminated by \n\n.
      if (buffer.trim()) handle(buffer);
    } catch (e) {
      // User-initiated stop: keep the partial message, show no error.
      // (fetch abort throws DOMException in browsers, plain Error elsewhere)
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") {
        // Close out anything left mid-stream so nothing looks stuck.
        setMessages((prev) =>
          prev.map((m) => {
            if (m.type === "thinking" && m.status === "streaming") {
              return {
                ...m,
                status: "done",
                durationMs: performance.now() - m.startedAt,
              };
            }
            if (m.type === "tool" && m.status === "running") {
              return {
                ...m,
                status: "error",
                errorMessage: "أُلغي التوليد",
              };
            }
            return m;
          }),
        );
        return;
      }
      const detail = e instanceof Error && e.message ? e.message : "";
      setMessages((prev) => [
        ...prev,
        {
          type: "message",
          role: "assistant",
          content: detail
            ? `حدث خطأ: ${detail}`
            : "حدث خطأ في الاتصال. حاول مرة أخرى.",
        },
      ]);
    } finally {
      abortRef.current = null;
      setStatus("ready");
    }
  }

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text?.trim();
      if (!text || !userId) return;

      // If the selected model needs a key and the user hasn't set one,
      // stash the message and open the gate; we re-fire runStream after save.
      if (keyStatus === "missing" && selectedConnection) {
        pendingTextRef.current = text;
        setGate({
          open: true,
          connectionId: selectedConnection.id,
          providerName: selectedConnection.name,
          docsUrl:
            myProviders?.catalog.find(
              (c) => c.slug === selectedConnection.slug,
            )?.docsUrl ?? null,
        });
        return;
      }

      // First send from `/` (no URL sessionId) — lazy-generate, push the
      // URL so reload/share works, then send. The push is async; runStream
      // already pulls sessionIdRef.current so the order is fine.
      const isFresh = !sessionIdRef.current;
      if (isFresh) {
        sessionIdRef.current = crypto.randomUUID();
        navigateToSession(sessionIdRef.current); // was router.push(...)

        // router.push(`/${sessionIdRef.current}`);
      }

      setMessages((prev) => [
        ...prev,
        { type: "message", role: "user", content: text },
      ]);
      setStatus("submitted");
      runStream(text);
    },
    // runStream closes over selectedModel/variant which change per render
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [
      userId,
      keyStatus,
      selectedConnection,
      selectedChef,
      selectedModel,
      variant,
      router,
      myProviders,
    ],
  );

  // Groups consecutive tool/thinking trace items of a turn into one stacked
  // block so multi-step runs read as a single trace above the assistant's
  // text, instead of disconnected floating cards. Collapsibility is provided
  // per-item (ChainOfThought / Tool), keeping live activity visible.
  function renderTurnItems(): ReactNode[] {
    const out: ReactNode[] = [];
    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.type === "tool" || msg.type === "thinking") {
        let j = i;
        while (
          j < messages.length &&
          (messages[j].type === "tool" || messages[j].type === "thinking")
        ) {
          j++;
        }
        out.push(
          <div
            key={`trace-${i}`}
            className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-1.5"
          >
            {messages.slice(i, j).map((tm, k) =>
              tm.type === "tool" ? (
                <Tool
                  key={i + k}
                  className="w-full max-w-md text-sm m-0"
                  call={tm}
                />
              ) : tm.type === "thinking" ? (
                <ThinkingBlock key={i + k} msg={tm} />
              ) : null,
            )}
          </div>,
        );
        i = j;
      } else {
        out.push(
          <Fragment key={i}>
            <div className={cn(msg.role === "user" && "flex justify-end")}>
              <Message
                from={msg.role}
                className={cn(
                  "group/message relative max-w-[70ch]",
                  msg.role === "user" && " rounded-xl px-5 py-3",
                )}
              >
                <MessageContent>
                  <MessageResponse
                    className={cn(
                      msg.role === "assistant" &&
                        "text-foreground leading-relaxed",
                    )}
                  >
                    {msg.content}
                  </MessageResponse>
                </MessageContent>
                {msg.role === "assistant" && (
                  <div className="mt-2 opacity-100 md:opacity-0 md:group-hover/message:opacity-100 transition-opacity duration-150">
                    <div className="absolute left-0">
                      <CopyButton
                        text={citationsToPlainText(msg.content.trim())}
                        variant="ghost"
                        size="icon"
                      />
                    </div>
                  </div>
                )}
              </Message>
            </div>
          </Fragment>,
        );
        i++;
      }
    }
    return out;
  }

  return (
    <>
      <main className="flex h-svh flex-col">
        <Conversation className="flex-1">
          <ConversationContent className="max-w-3xl mx-auto w-full px-4 py-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-24 text-center gap-8">
                {sessionId && (
                  <Link
                    href="/"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    dir="rtl"
                  >
                    ← محادثة جديدة
                  </Link>
                )}
                <div className="relative w-12 h-12 flex items-center justify-center mb-2">
                  <div className="absolute w-full h-px bg-primary/30" />
                  <div className="absolute h-full w-px bg-primary/30" />
                  <div className="size-3 rotate-45 bg-primary/20" />
                </div>
                <div className="flex flex-col items-center gap-3">
                  <h1 className="font-arabic text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
                    ما الذي تريد أن تتعلمه؟
                  </h1>
                  <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                    اسأل عن آية أو حديث أو مسألة، وسأجيبك بمصادر من القرآن
                    والسنة
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 w-full max-w-lg">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => controller.textInput.setInput(prompt)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 rounded-lg border border-border bg-card px-4 py-2.5 text-start hover:bg-secondary"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              renderTurnItems()
            )}
            {/* Skeleton only before the first visible activity of the turn;
                once thinking/tool/text arrives, that is the indicator. */}
            {status === "submitted" && (
              <div className="space-y-3 my-4 animate-pulse">
                <div className="h-4 bg-muted rounded-md w-3/4" />
                <div className="h-4 bg-muted rounded-md w-1/2" />
                <div className="h-20 bg-muted rounded-xl w-full border-r-2 border-primary/30" />
              </div>
            )}
          </ConversationContent>
          <ChatContainerScrollAnchor />
          <ConversationScrollButton />
        </Conversation>

        <div className="max-w-3xl mx-auto w-full px-4 pb-4 pt-2">
          <div className="bg-card rounded-2xl border border-input shadow-sm p-2">
            <PromptInput onSubmit={handleSubmit} className="relative w-full">
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder="اكتب سؤالك هنا..."
                  className="max-h-[200px] min-h-[44px] placeholder:text-muted-foreground"
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools className="gap-2 flex-wrap">
                  {models.length === 0 ? (
                    <PromptInputButton
                      onClick={() => router.push("/settings/providers")}
                    >
                      أضف مزوداً لبدء المحادثة
                    </PromptInputButton>
                  ) : (
                  <ModelSelector
                    open={modelSelectorOpen}
                    onOpenChange={setModelSelectorOpen}
                  >
                    <ModelSelectorTrigger asChild>
                      <PromptInputButton>
                        {selectedModel?.chefSlug && (
                          <ModelSelectorLogo
                            provider={selectedModel.chefSlug}
                          />
                        )}
                        {selectedModel?.name && (
                          <ModelSelectorName>
                            {selectedModel.name}
                          </ModelSelectorName>
                        )}
                      </PromptInputButton>
                    </ModelSelectorTrigger>
                    <ModelSelectorContent>
                      <ModelSelectorInput placeholder="ابحث عن النموذج..." />
                      <ModelSelectorList>
                        <ModelSelectorEmpty>
                          لا توجد نماذج مطابقة
                        </ModelSelectorEmpty>
                        {chefs.map((chef) => (
                          <ModelSelectorGroup heading={chef} key={chef}>
                            {models
                              .filter((m) => m.chef === chef)
                              .map((m) => (
                                <ModelSelectorItem
                                  key={m.id}
                                  onSelect={() => handleModelSelect(m.id)}
                                  value={m.chef + " " + m.name}
                                >
                                  <ModelSelectorLogo provider={m.chefSlug} />
                                  <ModelSelectorName>
                                    {m.name}
                                  </ModelSelectorName>
                                  <ModelSelectorLogoGroup>
                                    {m.providers.map((provider) => (
                                      <ModelSelectorLogo
                                        key={provider}
                                        provider={provider}
                                      />
                                    ))}
                                  </ModelSelectorLogoGroup>
                                  {modelId === m.id ? (
                                    <div className="ms-auto size-4 flex items-center justify-center">
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    </div>
                                  ) : (
                                    <div className="ms-auto size-4" />
                                  )}
                                </ModelSelectorItem>
                              ))}
                          </ModelSelectorGroup>
                        ))}
                      </ModelSelectorList>
                    </ModelSelectorContent>
                  </ModelSelector>
                  )}

                  <PromptInputSelect value={variant} onValueChange={setVariant}>
                    <PromptInputSelectTrigger className="max-w-[120px]">
                      <PromptInputSelectValue />
                    </PromptInputSelectTrigger>
                    <PromptInputSelectContent>
                      {(selectedModel?.variants ?? ["low"]).map((v) => (
                        <PromptInputSelectItem key={v} value={v}>
                          {variantLabel(v)}
                        </PromptInputSelectItem>
                      ))}
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                </PromptInputTools>
                <PromptInputSubmit
                  status={status}
                  onStop={() => abortRef.current?.abort()}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground/60">
            قد يخطئ الذكاء الاصطناعي، تحقق من المصادر
          </p>
        </div>
      </main>
      {userId && (
        <ApiKeyGate
          connectionId={gate.connectionId}
          providerName={gate.providerName}
          docsUrl={gate.docsUrl}
          open={gate.open}
          onOpenChange={(o) => setGate((g) => ({ ...g, open: o }))}
          onSaved={() => {
            listMyProviders().then(setMyProviders).catch(() => {});
            setGate((g) => ({ ...g, open: false }));
            if (pendingTextRef.current) {
              const text = pendingTextRef.current;
              pendingTextRef.current = null;
              if (!sessionIdRef.current) {
                sessionIdRef.current = crypto.randomUUID();
                router.push(`/${sessionIdRef.current}`);
              }
              setMessages((prev) => [
                ...prev,
                { type: "message", role: "user", content: text },
              ]);
              setStatus("submitted");
              runStream(text);
            }
          }}
        />
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  filterSuggestionItems,
} from "@blocknote/core";
import { ar } from "@blocknote/core/locales";
import {
  SuggestionMenuController,
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useTheme } from "next-themes";
import { BookOpen, Download, FileText, Link2 } from "lucide-react";

import { CitationCard, type CitationKind } from "@/components/citation-card";
import { Button } from "@/components/ui/button";
import {
  COLLECTION_KIND,
  SLASH_COMMANDS,
  finishMarkdown,
  prepareForMarkdown,
  type NoteBlock,
} from "@/lib/notes";
import { CitationPicker, type PickedCitation } from "./citation-picker";

// Citation block: a frozen snapshot of a cited source, rendered with the same
// card the chat uses. `meta` is the hit's display fields as JSON (BlockNote
// props are flat strings).
const Citation = createReactBlockSpec(
  {
    type: "citation",
    propSchema: {
      kind: { default: "quran" },
      refId: { default: "" },
      quote: { default: "" },
      grade: { default: "" },
      meta: { default: "{}" },
    },
    content: "none",
  },
  {
    render: ({ block }) => {
      const p = block.props;
      let meta: Record<string, string> = {};
      try { meta = JSON.parse(p.meta); } catch {}
      return (
        <div className="w-full" dir="rtl" contentEditable={false}>
          <CitationCard kind={p.kind as CitationKind} id={p.refId} grade={p.grade || undefined} {...meta}>
            {p.quote}
          </CitationCard>
        </div>
      );
    },
  },
);

// [[link]] to another note.
const NoteLink = createReactInlineContentSpec(
  {
    type: "noteLink",
    propSchema: { noteId: { default: "" }, title: { default: "" } },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <Link
        href={`/notes/${inlineContent.props.noteId}`}
        className="rounded bg-primary/10 px-1 text-primary hover:underline"
      >
        [[{inlineContent.props.title || "بلا عنوان"}]]
      </Link>
    ),
  },
);

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, citation: Citation() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, noteLink: NoteLink },
});

type Status = "saved" | "saving" | "error";

export default function NoteEditorImpl({
  noteId,
  initialTitle,
  initialDoc,
}: {
  noteId: string;
  initialTitle: string;
  initialDoc: unknown[];
}) {
  const { resolvedTheme } = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<Status>("saved");
  const [picker, setPicker] = useState<keyof typeof COLLECTION_KIND | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves run one at a time: two PATCHes in flight can land out of order and
  // an older doc would overwrite a newer one.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ title?: string; doc?: unknown }>({});

  const editor = useCreateBlockNote({
    schema,
    dictionary: ar,
    // BlockNote rejects an empty initialContent array.
    initialContent: initialDoc.length ? (initialDoc as never) : undefined,
  });

  // ponytail: debounced last-write-wins autosave; a second tab editing the
  // same note overwrites. Upgrade path: Yjs + Hocuspocus (issue's "later").
  function save(patch: { title?: string; doc?: unknown }) {
    pending.current = { ...pending.current, ...patch };
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      chain.current = chain.current.then(flush);
    }, 800);
  }
  async function flush() {
    const body = pending.current;
    if (!Object.keys(body).length) return;
    pending.current = {};
    try {
      const r = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      setStatus(r.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }
  // Flush a pending save when leaving the page.
  useEffect(() => {
    const onHide = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        chain.current = chain.current.then(flush);
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function insertCitation(c: PickedCitation) {
    const block = {
      type: "citation" as const,
      props: { kind: c.kind, refId: c.refId, quote: c.quote, grade: c.grade, meta: JSON.stringify(c.meta) },
    };
    const at = editor.getTextCursorPosition().block;
    const empty = Array.isArray(at.content) && at.content.length === 0;
    if (empty) editor.replaceBlocks([at], [block]);
    else editor.insertBlocks([block], at, "after");
  }

  const citationItems: DefaultReactSuggestionItem[] = SLASH_COMMANDS.map((c) => ({
    title: c.title,
    aliases: [...c.aliases],
    group: "المصادر",
    subtext: "ابحث وأدرج مع مصدره",
    icon: <BookOpen size={18} />,
    onItemClick: () => setPicker(c.collection),
  }));

  async function linkItems(query: string): Promise<DefaultReactSuggestionItem[]> {
    const insert = (id: string, t: string) => () =>
      editor.insertInlineContent([{ type: "noteLink", props: { noteId: id, title: t } }, " "]);
    const r = await fetch(`/api/notes?q=${encodeURIComponent(query)}`);
    const rows: { id: string; title: string }[] = r.ok ? await r.json() : [];
    const items: DefaultReactSuggestionItem[] = rows
      .filter((n) => n.id !== noteId)
      .map((n) => ({ title: n.title || "بلا عنوان", icon: <FileText size={18} />, onItemClick: insert(n.id, n.title) }));
    if (query.trim()) {
      items.push({
        title: `ملاحظة جديدة: ${query}`,
        icon: <Link2 size={18} />,
        onItemClick: async () => {
          const res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: query }),
          });
          if (res.ok) {
            const n = await res.json();
            insert(n.id, n.title)();
          }
        },
      });
    }
    return items;
  }

  function exportMarkdown() {
    const { blocks, footnotes } = prepareForMarkdown(editor.document as NoteBlock[]);
    const md = finishMarkdown(editor.blocksToMarkdownLossy(blocks as never), footnotes);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`# ${title}\n\n${md}`], { type: "text/markdown" }));
    a.download = `${title || "note"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            save({ title: e.target.value });
          }}
          placeholder="عنوان الملاحظة"
          aria-label="عنوان الملاحظة"
          dir="auto"
          className="flex-1 bg-transparent font-arabic text-2xl font-bold outline-none placeholder:text-muted-foreground/50"
        />
        <span className="text-xs text-muted-foreground" role="status">
          {status === "saving" ? "جارٍ الحفظ…" : status === "error" ? "تعذّر الحفظ" : "محفوظ"}
        </span>
        <Button variant="ghost" size="sm" onClick={exportMarkdown} className="gap-1">
          <Download className="size-4" /> Markdown
        </Button>
      </div>
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        slashMenu={false}
        onChange={() => save({ doc: editor.document })}
        className="notebook-editor min-h-[50vh]" // bidi + padding: globals.css
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (q) =>
            filterSuggestionItems([...citationItems, ...getDefaultReactSlashMenuItems(editor)], q)
          }
        />
        <SuggestionMenuController triggerCharacter="[[" getItems={linkItems} />
      </BlockNoteView>
      <CitationPicker
        key={picker ?? "closed"}
        collection={picker}
        onOpenChange={(o) => !o && setPicker(null)}
        onPick={(c) => {
          setPicker(null);
          insertCitation(c);
        }}
      />
    </div>
  );
}

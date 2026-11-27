// Pure notebook helpers (#15): ref keys, ref extraction on save, and the
// Markdown pre-pass for export. No React/DOM so they test under `bun test`.

// Search collection → citation kind (the kinds CitationCard renders).
export const COLLECTION_KIND = {
  quran: "quran",
  hadith: "hadith",
  tafsir: "tafsir",
  sunnah: "sunnah",
  books: "book",
} as const;

// Slash commands: label → search collection.
export const SLASH_COMMANDS = [
  { title: "آية", collection: "quran", aliases: ["aya", "ayah", "quran"] },
  { title: "حديث", collection: "hadith", aliases: ["hadith"] },
  { title: "أثر", collection: "sunnah", aliases: ["athar", "اثر"] },
  { title: "قول", collection: "books", aliases: ["qawl", "book"] },
  { title: "تفسير", collection: "tafsir", aliases: ["tafsir"] },
] as const;

/**
 * Canonical ref key: `${kind}:${corpus id}`, e.g. "quran:2:255" or
 * "hadith:bukhari:1". The backend's hadith ids carry a ".0" suffix
 * (bukhari:1.0); it is dropped so reader pages can build the same key
 * from a book key + number.
 */
export function noteRef(kind: string, id: string): string {
  return `${kind}:${id.replace(/\.0$/, "")}`;
}

// Local hadith book slugs → backend corpus book keys.
export const HADITH_SLUG_TO_KEY: Record<string, string> = {
  "sahih-al-bukhari": "bukhari",
  "sahih-muslim": "muslim",
};

// Minimal structural view of BlockNote's JSON; the stored doc is `any`.
type InlineNode = { type: string; text?: string; props?: Record<string, string> };
export type NoteBlock = {
  id: string;
  type: string;
  props?: Record<string, string>;
  content?: InlineNode[] | unknown;
  children?: NoteBlock[];
};

export type ExtractedCitation = {
  blockId: string;
  ref: string;
  quoteSnapshot: string | null;
  gradeSnapshot: string | null;
};

function* walk(blocks: NoteBlock[]): Generator<NoteBlock> {
  for (const b of blocks) {
    yield b;
    if (b.children?.length) yield* walk(b.children);
  }
}

/** Citations and distinct [[note]] link targets in a saved doc. */
export function extractRefs(doc: unknown): {
  citations: ExtractedCitation[];
  links: string[];
} {
  const citations: ExtractedCitation[] = [];
  const links = new Set<string>();
  if (!Array.isArray(doc)) return { citations, links: [] };
  for (const b of walk(doc as NoteBlock[])) {
    if (b.type === "citation" && b.props?.kind && b.props.refId) {
      citations.push({
        blockId: b.id,
        ref: noteRef(b.props.kind, b.props.refId),
        quoteSnapshot: b.props.quote || null,
        gradeSnapshot: b.props.grade || null,
      });
    }
    if (Array.isArray(b.content)) {
      for (const n of b.content as InlineNode[]) {
        if (n.type === "noteLink" && n.props?.noteId) links.add(n.props.noteId);
      }
    }
  }
  return { citations, links: [...links] };
}

/** Human source line for a citation footnote. */
export function citationLabel(kind: string, refId: string, meta: Record<string, string>): string {
  const num = refId.split(":").at(-1)?.replace(/\.0$/, "");
  if (kind === "quran") return `القرآن الكريم، ${meta.surah ?? ""} ${meta.ayah_number ?? refId}`.trim();
  if (kind === "tafsir") return `تفسير ${meta.tafsir_book ?? ""}، ${meta.surah ?? ""} ${meta.ayah_number ?? ""}`.trim();
  if (kind === "hadith") return `${meta.book ?? refId.split(":")[0]}، حديث رقم ${num}`;
  return [meta.book_name, meta.category_name].filter(Boolean).join("، ") || refId;
}

/**
 * Markdown export pre-pass: citation blocks become quote blocks carrying a
 * footnote marker, [[links]] become Obsidian-style `[[title]]` text. The
 * result goes through BlockNote's own blocksToMarkdownLossy; `finishMarkdown`
 * then undoes its bracket escaping and appends the footnotes.
 */
export function prepareForMarkdown(doc: NoteBlock[]): {
  blocks: NoteBlock[];
  footnotes: string[];
} {
  const footnotes: string[] = [];
  const map = (blocks: NoteBlock[]): NoteBlock[] =>
    blocks.map((b) => {
      const children = b.children?.length ? map(b.children) : b.children;
      if (b.type === "citation") {
        const p = b.props ?? {};
        let meta: Record<string, string> = {};
        try { meta = JSON.parse(p.meta || "{}"); } catch {}
        footnotes.push(citationLabel(p.kind, p.refId, meta));
        return {
          id: b.id,
          type: "quote",
          content: [{ type: "text", text: `${p.quote} [^${footnotes.length}]` }],
          children,
        };
      }
      const content = Array.isArray(b.content)
        ? (b.content as InlineNode[]).map((n) =>
            n.type === "noteLink" ? { type: "text", text: `[[${n.props?.title ?? ""}]]` } : n,
          )
        : b.content;
      return { ...b, content, children };
    });
  return { blocks: map(doc), footnotes };
}

// ponytail: unescapes every bracket/caret, so a literal "\[" the user typed
// also comes out bare. Upgrade path: emit links/markers as placeholders.
export function finishMarkdown(md: string, footnotes: string[]): string {
  const body = md.replace(/\\\[/g, "[").replace(/\\\]/g, "]").replace(/\\\^/g, "^");
  if (!footnotes.length) return body;
  return `${body.trimEnd()}\n\n${footnotes.map((f, i) => `[^${i + 1}]: ${f}`).join("\n")}\n`;
}

export type PickedCitation = {
  kind: string;
  refId: string;
  quote: string;
  grade: string;
  meta: Record<string, string>;
};

const META_KEYS = ["surah", "surah_number", "ayah_number", "tafsir_book", "book", "hadith_number", "book_name", "category_name"];

/**
 * Vector-search hit → citation block props. The ref id is rebuilt from the
 * structured fields when present (the same "2:255" / "bukhari:1" shapes the
 * chat's citation tags and the reader pages use), else the corpus id.
 */
export function hitToCitation(
  collection: keyof typeof COLLECTION_KIND,
  payload: Record<string, unknown>,
): PickedCitation {
  const meta: Record<string, string> = {};
  for (const k of META_KEYS) if (payload[k] != null && payload[k] !== "") meta[k] = String(payload[k]);
  const { surah_number: s, ayah_number: a, tafsir_book: t, book: b, hadith_number: n } = meta;
  const refId =
    collection === "quran" && s && a ? `${s}:${a}`
    : collection === "tafsir" && t && s && a ? `${t}:${s}:${a}`
    : collection === "hadith" && b && n ? `${b}:${n}`
    : String(payload.ids ?? payload.id ?? "");
  return {
    kind: COLLECTION_KIND[collection],
    refId,
    quote: String(payload.text ?? ""),
    grade: payload.grade ? String(payload.grade) : "",
    meta,
  };
}

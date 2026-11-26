import { expect, test } from "bun:test";
import { extractRefs, finishMarkdown, hitToCitation, noteRef, prepareForMarkdown, type NoteBlock } from "./notes";

const cite = (id: string, kind: string, refId: string, extra: Record<string, string> = {}): NoteBlock => ({
  id,
  type: "citation",
  props: { kind, refId, quote: "نص", grade: "", meta: "{}", ...extra },
});

const doc: NoteBlock[] = [
  { id: "p1", type: "paragraph", content: [
    { type: "text", text: "انظر " },
    { type: "noteLink", props: { noteId: "n2", title: "الصبر" } },
    { type: "noteLink", props: { noteId: "n2", title: "الصبر" } }, // duplicate link
  ] },
  cite("c1", "quran", "2:255", { meta: JSON.stringify({ surah: "البقرة", ayah_number: "255" }) }),
  { id: "l1", type: "bulletListItem", content: [], children: [
    cite("c2", "hadith", "bukhari:1.0", { grade: "صحيح", meta: JSON.stringify({ book: "صحيح البخاري" }) }),
  ] },
  cite("bad", "quran", ""), // no ref id: ignored
];

test("noteRef drops the backend's .0 hadith suffix", () => {
  expect(noteRef("hadith", "bukhari:1.0")).toBe("hadith:bukhari:1");
  expect(noteRef("quran", "2:255")).toBe("quran:2:255");
});

test("extractRefs finds nested citations and distinct links", () => {
  expect(extractRefs(doc)).toEqual({
    citations: [
      { blockId: "c1", ref: "quran:2:255", quoteSnapshot: "نص", gradeSnapshot: null },
      { blockId: "c2", ref: "hadith:bukhari:1", quoteSnapshot: "نص", gradeSnapshot: "صحيح" },
    ],
    links: ["n2"],
  });
  expect(extractRefs(null)).toEqual({ citations: [], links: [] });
});

test("markdown pre-pass: citations become footnoted quotes, links become [[title]]", () => {
  const { blocks, footnotes } = prepareForMarkdown(doc);
  expect(blocks[0].content).toEqual([
    { type: "text", text: "انظر " },
    { type: "text", text: "[[الصبر]]" },
    { type: "text", text: "[[الصبر]]" },
  ]);
  expect(blocks[1]).toMatchObject({ type: "quote", content: [{ text: "نص [^1]" }] });
  expect(blocks[2].children?.[0]).toMatchObject({ type: "quote", content: [{ text: "نص [^2]" }] });
  expect(footnotes.slice(0, 2)).toEqual(["القرآن الكريم، البقرة 255", "صحيح البخاري، حديث رقم 1"]);
  expect(finishMarkdown("> نص \\[^1]\n\n\\[\\[الصبر\\]\\]\n", ["مصدر"])).toBe("> نص [^1]\n\n[[الصبر]]\n\n[^1]: مصدر\n");
});

test("hitToCitation rebuilds canonical ref ids from structured fields", () => {
  expect(hitToCitation("quran", { ids: 262, text: "آية", surah: "البقرة", surah_number: 2, ayah_number: 255 }))
    .toEqual({ kind: "quran", refId: "2:255", quote: "آية", grade: "", meta: { surah: "البقرة", surah_number: "2", ayah_number: "255" } });
  expect(hitToCitation("hadith", { ids: "x", text: "ح", book: "bukhari", hadith_number: 1, grade: "صحيح" }))
    .toMatchObject({ kind: "hadith", refId: "bukhari:1", grade: "صحيح" });
  expect(hitToCitation("tafsir", { text: "ت", tafsir_book: "muyassar", surah_number: 1, ayah_number: 2 }).refId).toBe("muyassar:1:2");
  expect(hitToCitation("books", { ids: "0:12:3", text: "ن", book_name: "الزهد" })).toMatchObject({ kind: "book", refId: "0:12:3" });
});

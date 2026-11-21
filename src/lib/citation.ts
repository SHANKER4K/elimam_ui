/**
 * Strips Arabic diacritics (tashkeel) from text.
 */
export function stripDiacritics(text: string): string {
  return text.replace(
    /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g,
    "",
  );
}

export function formatVerseCitation(
  verseText: string,
  surahName: string,
  verseNumber: number,
): string {
  return `${verseText} ﴿${surahName}: ${verseNumber}﴾`;
}

export function formatHadithCitation(
  hadithText: string,
  bookName: string,
  hadithNumber: number,
  narrator?: string | null,
): string {
  let citation = `${hadithText}\n${bookName}، حديث رقم ${hadithNumber}`;
  if (narrator) {
    citation += `، عن ${narrator}`;
  }
  return citation;
}

/** Arabic names for the hadith book slugs used in the corpus. */
export const HADITH_BOOK_NAMES: Record<string, string> = {
  bukhari: "صحيح البخاري",
  muslim: "صحيح مسلم",
  abudawud: "سنن أبي داود",
  ibnmajah: "سنن ابن ماجه",
  malik: "موطأ مالك",
  nasai: "سنن النسائي",
  tirmidhi: "جامع الترمذي",
  nawawi: "الأربعون النووية",
  qudsi: "الأحاديث القدسية",
};

/** Arabic names for the tafsir book slugs used in the corpus. */
export const TAFSIR_BOOK_NAMES: Record<string, string> = {
  saadi: "السعدي",
  katheer: "ابن كثير",
  moyassar: "الميسر",
  tabary: "الطبري",
  baghawy: "البغوي",
};

const CITATION_TAG_RE =
  /<(quran|tafsir|hadith|book|books|athar|sunnah)\b([^>]*)>([\s\S]*?)<\/\1>/g;

function readAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Resolves (surah, ayah) from a verse citation id: quran is "2:255",
 * tafsir may carry a book prefix ("saadi:2:255"). */
export function parseVerseRef(
  tag: string,
  id: string | undefined,
): { surah?: number; ayah?: number } {
  if (!id) return {};
  let parts = id.split(":");
  if (tag === "tafsir" && TAFSIR_BOOK_NAMES[parts[0]] !== undefined) {
    parts = parts.slice(1);
  }
  const surah = parseInt(parts[0] ?? "", 10);
  const ayah = parseInt(parts[1] ?? "", 10);
  return {
    ...(Number.isFinite(surah) ? { surah } : {}),
    ...(Number.isFinite(ayah) ? { ayah } : {}),
  };
}

/** Converts a message containing citation tags into clean Arabic plain
 * text: «text» [reference] — used when copying the whole response. */
export function citationsToPlainText(content: string): string {
  return content.replace(
    CITATION_TAG_RE,
    (_match, tag: string, attrs: string, inner: string) => {
      const text = inner.trim();
      const id = readAttr(attrs, "id") ?? "";
      let ref = "";
      if (tag === "quran" || tag === "tafsir") {
        const parsed = parseVerseRef(tag, id);
        const surah =
          readAttr(attrs, "surah") ??
          readAttr(attrs, "surah_number") ??
          (parsed.surah !== undefined ? String(parsed.surah) : "");
        const ayah =
          readAttr(attrs, "ayah_number") ??
          (parsed.ayah !== undefined ? String(parsed.ayah) : "");
        ref =
          surah && ayah
            ? /^\d/.test(surah)
              ? `${surah}:${ayah}`
              : `${surah}: ${ayah}`
            : [surah, ayah].filter(Boolean).join("");
      } else if (tag === "hadith") {
        const book =
          HADITH_BOOK_NAMES[readAttr(attrs, "book") ?? ""] ??
          readAttr(attrs, "book") ??
          "";
        const number = id.split(":")[1]?.replace(/\.0$/, "") ?? "";
        ref = [book, number ? `رقم ${number}` : ""].filter(Boolean).join("، ");
      } else {
        ref =
          readAttr(attrs, "book_name") ??
          TAFSIR_BOOK_NAMES[readAttr(attrs, "tafsir_book") ?? ""] ??
          "";
      }
      return `«${text}»${ref ? ` [${ref}]` : ""}`;
    },
  );
}

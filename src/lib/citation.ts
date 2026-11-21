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
        const surah = readAttr(attrs, "surah") ?? id.split(":")[0] ?? "";
        const ayah =
          readAttr(attrs, "ayah_number") ?? id.split(":")[1] ?? "";
        ref = [surah, ayah].filter(Boolean).join(": ");
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

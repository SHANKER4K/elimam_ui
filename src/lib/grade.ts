export const GRADE_CANONICAL = [
  "sahih",
  "hasan",
  "daif",
  "very_daif",
  "mawdu",
  "unknown",
] as const;
export type GradeCanonical = (typeof GRADE_CANONICAL)[number];

export const GRADE_LABELS: Record<GradeCanonical, string> = {
  sahih: "صحيح",
  hasan: "حسن",
  daif: "ضعيف",
  very_daif: "ضعيف جدًا",
  mawdu: "موضوع",
  unknown: "غير محكوم عليه",
};

// Strip tashkeel + tatweel and fold alef/ya forms so "ضعيفٌ جداً" matches.
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
}

// Checked in order, most severe first, so "Hasan Sahih" never outranks a
// weakness term and "Daif Jiddan" is caught before plain "Daif".
// Munkar/Shadh fold into daif, as in the shared proposal (SHANKER4K/elimam#28).
// ponytail: substring heuristic over the ~15 labels seen in the corpus
// (SHANKER4K/elimam#27); unrecognised labels fall through to "unknown" rather
// than guessing. Upgrade path: an explicit label→canonical table from the backend.
const RULES: [GradeCanonical, RegExp][] = [
  ["mawdu", /mawd[uo]|موضوع|مكذوب/],
  ["very_daif", /very|jidd|جدا|matruk|متروك/],
  ["daif", /dh?a['ie]*f|ضعيف|munkar|منكر|shadh|شاذ/],
  ["hasan", /hasan|حسن/],
  ["sahih", /sah[ie]+h|صحيح/],
];

/**
 * Map any grade label (canonical value, legacy enum, English or Arabic raw
 * label) to a canonical grade. Missing or unrecognised → "unknown", never
 * "sahih": showing a hadith as authentic without a source is the bug #16 fixes.
 */
export function normalizeGrade(raw: string | null | undefined): GradeCanonical {
  if (!raw) return "unknown";
  if ((GRADE_CANONICAL as readonly string[]).includes(raw)) return raw as GradeCanonical;
  const s = fold(raw);
  return RULES.find(([, re]) => re.test(s))?.[0] ?? "unknown";
}

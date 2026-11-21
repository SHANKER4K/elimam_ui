"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CopyButton } from "./copy-button";
import { ExportModal } from "./export-modal";
import {
  formatVerseCitation,
  HADITH_BOOK_NAMES,
  TAFSIR_BOOK_NAMES,
} from "@/lib/citation";
import { Maximize2 } from "lucide-react";
import Link from "next/link";

export type CitationKind =
  | "quran"
  | "tafsir"
  | "hadith"
  | "book"
  | "books"
  | "athar"
  | "sunnah";

export type CitationProps = {
  kind: CitationKind;
  id?: string;
  match?: string;
  surah?: string;
  surah_number?: string | number;
  ayah_number?: string | number;
  tafsir_book?: string;
  book?: string;
  grade?: string;
  book_name?: string;
  category_name?: string;
  children?: ReactNode;
};

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
      {children}
    </span>
  );
}

// Same palette as HadithCard's grade pills.
const GRADE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  صحيح: { bg: "bg-[#EDF3EC]", text: "text-[#4A7C59]", dot: "bg-[#4A7C59]" },
  حسن: { bg: "bg-[#FBF3DB]", text: "text-[#8B6914]", dot: "bg-[#B4882E]" },
  ضعيف: { bg: "bg-[#FDEBEC]", text: "text-[#9B2C2C]", dot: "bg-[#C44B4B]" },
};

function flatten(children: ReactNode): string {
  if (children === null || children === undefined || typeof children === "boolean")
    return "";
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(flatten).join("");
  return "";
}

/**
 * Renders a canonical citation tag (<quran>, <tafsir>, <hadith>, <book>,
 * <books>, <athar>, <sunnah>) as a rich Arabic source card. The tags are
 * persisted in messages.content, so cards re-render after a reload from
 * fetchHistory() alone — no dependency on ephemeral SSE events.
 */
export function CitationCard(props: CitationProps) {
  const { kind, id, match } = props;
  const text = flatten(props.children).trim();
  const [open, setOpen] = useState(false);
  if (!text) return null;

  let chips: ReactNode = null;
  let body: ReactNode = null;
  let href: string | null = null;
  let citationText: string | null = null;
  let exportType: "ayah" | "hadith" | null = null;
  let exportSource = "";

  if (kind === "quran" || kind === "tafsir") {
    const surahNumber = Number(
      props.surah_number ?? id?.split(":")[0] ?? NaN,
    );
    const ayah = Number(props.ayah_number ?? id?.split(":")[1] ?? NaN);
    if (Number.isFinite(surahNumber) && Number.isFinite(ayah)) {
      href = `/quran/${surahNumber}/${ayah}`;
    }
    const mufassir =
      TAFSIR_BOOK_NAMES[props.tafsir_book ?? id?.split(":")[0] ?? ""] ?? null;
    const verseRef = props.surah
      ? `﴿${props.surah}${props.ayah_number ? `: ${props.ayah_number}` : ""}﴾`
      : null;
    chips = (
      <>
        {mufassir && <Chip>{kind === "tafsir" ? `تفسير ${mufassir}` : mufassir}</Chip>}
        {verseRef && <Chip>{verseRef}</Chip>}
      </>
    );
    body = (
      <p
        dir="rtl"
        className={
          kind === "quran"
            ? "font-quran text-2xl leading-[2] text-foreground"
            : "font-arabic text-base leading-8 text-foreground"
        }
      >
        {text}
      </p>
    );
    if (kind === "quran" && props.surah && Number.isFinite(ayah)) {
      citationText = formatVerseCitation(text, props.surah, ayah);
      exportType = "ayah";
      exportSource = `${props.surah} - الآية ${ayah}`;
    }
  } else if (kind === "hadith") {
    const bookName =
      HADITH_BOOK_NAMES[props.book ?? id?.split(":")[0] ?? ""] ??
      props.book ??
      id?.split(":")[0] ??
      "";
    const number = id?.split(":")[1]?.replace(/\.0$/, "") ?? "";
    const grade = props.grade;
    const gradeStyle = grade ? GRADE_STYLES[grade] : null;
    href = props.book && number ? `/hadith/${props.book}/${number}` : null;
    chips = (
      <>
        {bookName && <Chip>{bookName}</Chip>}
        {number && <Chip>حديث {number}</Chip>}
        {gradeStyle && grade ? (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${gradeStyle.bg} ${gradeStyle.text} font-medium inline-flex items-center gap-1.5`}
          >
            <span className={`size-1.5 rounded-full ${gradeStyle.dot}`} />
            {grade}
          </span>
        ) : null}
      </>
    );
    body = (
      <p
        dir="rtl"
        className="font-arabic text-lg leading-9 text-foreground"
      >
        {text}
      </p>
    );
    if (bookName && number) {
      citationText = `${text}\n${bookName}، حديث رقم ${Number(number)}`;
      exportType = "hadith";
      exportSource = `${bookName} - حديث ${number}`;
    }
  } else {
    // book / books / athar / sunnah excerpts
    chips = (
      <>
        {props.book_name && <Chip>{props.book_name}</Chip>}
        {props.category_name && <Chip>{props.category_name}</Chip>}
      </>
    );
    body = (
      <p
        dir="rtl"
        className="font-arabic text-base leading-8 text-foreground"
      >
        {text}
      </p>
    );
  }

  return (
    <span className="group block my-2 rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {chips}
        {match === "fuzzy" && <Chip>تطابق تقريبي</Chip>}
      </div>
      {href ? (
        <Link href={href} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
      <div className="mt-2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
        <CopyButton text={text} citationText={citationText ?? undefined} />
        {exportType && (
          <ExportModal text={text} source={exportSource} type={exportType}>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full hover:bg-muted"
            >
              <Maximize2 className="size-4 stroke-[1.5]" />
            </Button>
          </ExportModal>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground gap-1 text-xs"
            >
              <Maximize2 className="size-3.5" />
              عرض المقتطف كاملاً
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-sm">
                {chips}
              </DialogTitle>
            </DialogHeader>
            <div
              dir="rtl"
              className={
                kind === "quran"
                  ? "max-h-[60vh] overflow-y-auto whitespace-pre-wrap font-quran text-2xl leading-[2]"
                  : "max-h-[60vh] overflow-y-auto whitespace-pre-wrap font-arabic text-lg leading-9"
              }
            >
              {text}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { COLLECTION_LABELS } from "@/lib/vector-search-config";
import { COLLECTION_KIND, hitToCitation, type PickedCitation } from "@/lib/notes";

export type { PickedCitation };

/**
 * Search one corpus via the existing /api/search relay and pick a source.
 * The parent keys this by collection, so each open starts with fresh state.
 */
export function CitationPicker({
  collection,
  onOpenChange,
  onPick,
}: {
  collection: keyof typeof COLLECTION_KIND | null;
  onOpenChange: (open: boolean) => void;
  onPick: (c: PickedCitation) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PickedCitation[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const active = collection !== null && query.trim().length >= 2;

  useEffect(() => {
    if (!active) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const r = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "hybrid", collection, query_text: query, top_k: 8 }),
          signal: ctl.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error();
        const rows: { payload?: Record<string, unknown> }[] = Array.isArray(data.results) ? data.results : [];
        setHits(rows.map((h) => hitToCitation(collection, h.payload ?? {})).filter((c) => c.quote));
        setState("idle");
      } catch {
        if (!ctl.signal.aborted) setState("error");
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [active, collection, query]);

  return (
    <Dialog open={collection !== null} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إدراج من {collection ? COLLECTION_LABELS[collection] : ""}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالمعنى أو بالنص…"
          aria-label="البحث عن مصدر"
        />
        <div className="max-h-[50vh] space-y-2 overflow-y-auto" aria-live="polite">
          {state === "loading" && <Spinner className="mx-auto my-4" />}
          {state === "error" && <p className="text-sm text-destructive">تعذّر البحث. حاول مرة أخرى.</p>}
          {(active ? hits : []).map((h, i) => (
            <button
              key={`${h.refId}-${i}`}
              type="button"
              onClick={() => onPick(h)}
              className="block w-full rounded-lg border border-border p-3 text-start hover:bg-muted focus-visible:bg-muted outline-none"
            >
              <p className="font-arabic line-clamp-3 leading-7">{h.quote}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[h.meta.surah, h.meta.ayah_number, h.meta.book, h.meta.hadith_number, h.meta.book_name, h.grade]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

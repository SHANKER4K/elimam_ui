"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { BookOpenText, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLECTIONS,
  COLLECTION_LABELS,
  buildFiltersPayload,
  type Collection,
} from "@/lib/vector-search-config";
import { extractSearchError } from "@/lib/search-error";
import { VectorResults, type VectorHit } from "./vector-results";

const AdvancedSearchFilters = dynamic(
  () =>
    import("./advanced-search-filters").then(
      (module) => module.AdvancedSearchFilters,
    ),
  { ssr: false },
);

type Method = "dense" | "sparse" | "hybrid";

export function VectorSearchTool() {
  const [method, setMethod] = useState<Method>("hybrid");
  const [collection, setCollection] = useState<Collection>("quran");
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(10);
  const [pool, setPool] = useState(20);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [results, setResults] = useState<VectorHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!query.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const start = performance.now();

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          collection,
          query_text: query,
          top_k: topK,
          pool,
          filters: buildFiltersPayload(collection, filters),
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      const rows: unknown[] = Array.isArray(data.results) ? data.results : [];
      const first = rows[0];
      // Legacy backends answered 200 with [{ error }] instead of a status code.
      if (
        first !== null &&
        typeof first === "object" &&
        "error" in first &&
        !("payload" in first)
      ) {
        throw new Error(extractSearchError(rows, response.status));
      }
      if (!response.ok) throw new Error(extractSearchError(data, response.status));
      setResults(rows as VectorHit[]);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      setError(error instanceof Error ? error.message : "فشل البحث");
      setResults(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setDuration(performance.now() - start);
      }
    }
  }, [collection, filters, method, pool, query, topK]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-8"
      dir="rtl"
    >
      <Card className="rounded-2xl border-border/60 bg-card/90 shadow-sm backdrop-blur-md">
        <CardContent className="space-y-6 p-5 sm:p-7">
          <div className="space-y-3">
            <label className="text-sm font-semibold tracking-wide text-foreground/90" htmlFor="query-text">
              ما الذي تبحث عنه؟
            </label>
            <Textarea
              id="query-text"
              dir="rtl"
              rows={3}
              placeholder="مثال: آيات عن الصبر، أو أحاديث في طلب العلم"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void run();
                }
              }}
              className="resize-y rounded-xl border-border/80 bg-background/50 text-base leading-7 shadow-2xs focus-visible:ring-primary/40"
            />
          </div>

          <div className="space-y-3">
            <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">ابحث في</span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {COLLECTIONS.map((item) => {
                const isActive = collection === item;
                return (
                  <Button
                    key={item}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    onClick={() => {
                      setCollection(item);
                      setFilters({});
                    }}
                    className={`min-h-12 justify-start gap-2.5 rounded-xl px-3.5 text-sm transition-all ${
                      isActive
                        ? "shadow-sm shadow-primary/20 ring-1 ring-primary/30"
                        : "border-border/60 bg-background/40 hover:bg-muted/50"
                    }`}
                  >
                    <BookOpenText className="size-4 opacity-75" />
                    <span className="truncate font-medium">{COLLECTION_LABELS[item]}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <AdvancedSearchFilters
            collection={collection}
            filters={filters}
            method={method}
            pool={pool}
            topK={topK}
            onFiltersChange={setFilters}
            onMethodChange={setMethod}
            onPoolChange={setPool}
            onTopKChange={setTopK}
          />

          <Button
            onClick={run}
            disabled={loading || !query.trim()}
            className="w-full gap-2 rounded-xl py-6 text-base font-medium shadow-sm transition-transform active:scale-[0.98] sm:w-auto sm:px-8"
          >
            <Search className="size-4" />
            بحث في المكتبة
          </Button>
        </CardContent>
      </Card>

      <VectorResults
        collection={collection}
        results={results}
        loading={loading}
        error={error}
        duration={duration}
        onRetry={run}
      />
    </motion.div>
  );
}

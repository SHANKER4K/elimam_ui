"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, ChevronDown, RefreshCw, Clock } from "lucide-react";
import { DISPLAY_FIELDS, type Collection } from "@/lib/vector-search-config";
import Link from "next/link";

export interface VectorHit {
  score?: number;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface VectorResultsProps {
  collection: Collection;
  results: VectorHit[] | null;
  loading: boolean;
  error: string | null;
  duration: number | null;
  onRetry: () => void;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function metadataRows(
  collection: Collection,
  payload: Record<string, unknown>,
) {
  return DISPLAY_FIELDS[collection]
    .filter((f) => payload[f.key] !== undefined && payload[f.key] !== null)
    .map((f) => ({ ...f, value: formatValue(payload[f.key]) }));
}

export function VectorResults({
  collection,
  results,
  loading,
  error,
  duration,
  onRetry,
}: VectorResultsProps) {
  if (loading) {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>جارٍ البحث في الأرشيف...</span>
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
        <CardContent className="p-8 text-center">
          <p className="mb-4 text-sm font-medium text-destructive">{error}</p>
          <Button
            variant="outline"
            onClick={onRetry}
            className="rounded-xl gap-2"
          >
            <RefreshCw className="size-4" />
            إعادة المحاولة
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!results) return null;

  if (results.length === 0) {
    return (
      <Card className="rounded-2xl border-border/60 bg-card/60">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          لم يتم العثور على نتائج مطابقة لبحثك
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex items-center justify-between px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span>
          {results.length} {results.length === 1 ? "نتيجة" : "نتائج"} مطابقة
        </span>
        {duration !== null && (
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 opacity-70" />
            {(duration / 1000).toFixed(2)} ثانية
          </span>
        )}
      </div>

      <div className="space-y-3">
        {[...results]
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .map((hit, i) => {
            const payload = (hit.payload ?? {}) as Record<string, unknown>;
            const meta = metadataRows(collection, payload);
            const text = payload.text;
            return (
              <motion.div
                key={`${formatValue(payload.id)}-${i}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: i * 0.04,
                  ease: "easeOut",
                }}
              >
                <Card className="group rounded-2xl border-border/60 bg-card/90 shadow-xs transition-all hover:border-primary/30 hover:shadow-md">
                  <CardContent className="p-5 sm:p-6">
                    <a
                      href={
                        ["quran", "tafsir"].includes(collection)
                          ? `https://quran.com/${payload.surah_number}/${payload.ayah_number}`
                          : (payload.source as string)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* The searched text */}
                      {text !== undefined && text !== null && text !== "" ? (
                        <p
                          dir="rtl"
                          className="font-arabic text-lg leading-9 sm:text-xl text-foreground/95"
                        >
                          {formatValue(text)}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          لا يوجد نص
                        </p>
                      )}
                    </a>

                    {/* Metadata as badges */}
                    {meta.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {meta.map((m) => (
                          <Badge
                            key={m.key}
                            variant="outline"
                            className="rounded-lg border-border/80 bg-background/60 px-2.5 py-1 text-xs font-normal text-muted-foreground"
                          >
                            <span className="font-medium text-foreground/80 ml-1">
                              {m.label}:
                            </span>{" "}
                            {m.value}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                      <Collapsible className="w-full">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ChevronDown className="size-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            التفاصيل التقنية
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre
                            dir="ltr"
                            className="mt-3 overflow-x-auto rounded-xl bg-muted/60 p-3.5 text-xs font-mono leading-relaxed text-foreground/80"
                          >
                            {JSON.stringify(hit, null, 2)}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}

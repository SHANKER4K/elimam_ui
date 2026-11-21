"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { formatToolDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Book,
  BookOpen,
  CheckCircle,
  ChevronDown,
  Landmark,
  Library,
  List,
  Loader2,
  ScrollText,
  Search,
  Settings,
  XCircle,
} from "lucide-react"
import { useState } from "react"

export type ToolPreviewRow = { ids?: string; text: string }

/** Matches the enriched `tool` / `tool_result` SSE contract (elimam#15). */
export type ToolCall = {
  title: string
  subtitle?: string
  icon?: string
  status: "running" | "ok" | "empty" | "error"
  summary?: string
  count?: number | null
  durationMs?: number | null
  errorMessage?: string
  preview?: ToolPreviewRow[]
}

const ICONS: Record<string, typeof Search> = {
  search: Search,
  quran: BookOpen,
  tafsir: Book,
  hadith: ScrollText,
  book: Library,
  athar: Landmark,
  list: List,
  tool: Settings,
}

export type ToolProps = {
  call: ToolCall
  className?: string
}

const Tool = ({ call, className }: ToolProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const Icon = (call.icon && ICONS[call.icon]) || Settings
  const duration = formatToolDuration(call.durationMs)
  const hasPreview = (call.preview?.length ?? 0) > 0

  return (
    <div
      className={cn(
        "border-border mt-3 overflow-hidden rounded-lg border",
        className
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild disabled={!hasPreview}>
          <Button
            variant="ghost"
            className="bg-background h-auto w-full justify-between rounded-b-none px-3 py-2 font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              {call.status === "running" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
              ) : call.status === "error" ? (
                <XCircle className="size-4 shrink-0 text-red-500" />
              ) : (
                <Icon className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate text-sm font-medium">
                  {call.title}
                </span>
                {call.subtitle && (
                  <span className="text-muted-foreground truncate text-xs">
                    {call.subtitle}
                  </span>
                )}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {duration && (
                <span className="text-muted-foreground text-xs">{duration}</span>
              )}
              {call.status === "running" ? null : call.status === "error" ? (
                <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  فشل
                </span>
              ) : call.status === "empty" ? (
                <Badge
                  variant="outline"
                  className="text-muted-foreground rounded-full px-2 py-1 text-xs font-normal"
                >
                  لا توجد نتائج
                </Badge>
              ) : call.summary ? (
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {call.summary}
                </span>
              ) : (
                <CheckCircle className="size-4 text-green-500" />
              )}
              {hasPreview && (
                <ChevronDown
                  className={cn("size-4", isOpen && "rotate-180")}
                />
              )}
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            "border-border border-t",
            "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
          )}
        >
          <div className="bg-background space-y-2 p-3">
            {call.status === "error" && call.errorMessage && (
              <div className="rounded border border-red-200 p-2 text-sm dark:border-red-950 dark:bg-red-900/20">
                {call.errorMessage}
              </div>
            )}
            {call.preview?.map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                {row.ids && (
                  <Badge
                    variant="outline"
                    dir="ltr"
                    className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs"
                  >
                    {row.ids}
                  </Badge>
                )}
                <p
                  dir="rtl"
                  className="font-arabic text-sm leading-7 whitespace-pre-wrap"
                >
                  {row.text}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { Tool }
